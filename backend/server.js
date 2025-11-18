const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./database');
const schemaHandler = require('./schemaHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Initialize database before starting server
let serverReady = false;

db.initDatabase().then(() => {
  serverReady = true;
  console.log('Database initialized');
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// POST new correction
app.post('/api/corrections', (req, res) => {
  if (!serverReady) {
    return res.status(503).json({ error: 'Server is initializing' });
  }

  try {
    const rawData = req.body;

    // Process incoming data with schema detection
    const result = schemaHandler.processIncomingData(rawData);

    if (!result.success) {
      return res.status(400).json({
        error: result.error
      });
    }

    // Save to database
    const id = db.saveCorrection(result.data);

    // Get frontend URL from environment or use default
    const frontendUrl = process.env.FRONTEND_URL || 'https://correction-viewer-frontend-qpfdynkt7a-lz.a.run.app';
    const correctionUrl = `${frontendUrl}/correction/${id}`;

    res.status(201).json({
      success: true,
      id,
      url: correctionUrl,
      schema: result.schema,
      message: `Correction saved successfully (schema: ${result.schema})`
    });
  } catch (error) {
    console.error('Error saving correction:', error);
    res.status(500).json({
      error: 'Failed to save correction',
      details: error.message
    });
  }
});

// GET all corrections (list view)
app.get('/api/corrections', (req, res) => {
  if (!serverReady) {
    return res.status(503).json({ error: 'Server is initializing' });
  }

  try {
    const corrections = db.listCorrections();
    res.json(corrections);
  } catch (error) {
    console.error('Error fetching corrections:', error);
    res.status(500).json({
      error: 'Failed to fetch corrections',
      details: error.message
    });
  }
});

// GET single correction by ID
app.get('/api/corrections/:id', (req, res) => {
  if (!serverReady) {
    return res.status(503).json({ error: 'Server is initializing' });
  }

  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const correction = db.getCorrection(id);

    if (!correction) {
      return res.status(404).json({ error: 'Correction not found' });
    }

    res.json(correction);
  } catch (error) {
    console.error('Error fetching correction:', error);
    res.status(500).json({
      error: 'Failed to fetch correction',
      details: error.message
    });
  }
});

// GET corrected text for a correction (for export to CMS)
app.get('/api/corrections/:id/corrected-text', (req, res) => {
  if (!serverReady) {
    return res.status(503).json({ error: 'Server is initializing' });
  }

  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const correction = db.getCorrection(id);

    if (!correction) {
      return res.status(404).json({ error: 'Correction not found' });
    }

    // Return just the corrected text for easy consumption by CMS
    const correctedText = typeof correction.corrected_article.body === 'string'
      ? correction.corrected_article.body
      : (Array.isArray(correction.corrected_article.body)
        ? correction.corrected_article.body.join('\n\n')
        : '');

    res.json({
      id: correction.id,
      schema_version: correction.schema_version || 'v1',
      corrected_text: correctedText,
      title: correction.corrected_article.title || correction.original_article?.title,
      changes_count: correction.merged_changes?.length || correction.applied?.length || 0
    });
  } catch (error) {
    console.error('Error fetching corrected text:', error);
    res.status(500).json({
      error: 'Failed to fetch corrected text',
      details: error.message
    });
  }
});

// DELETE correction by ID
app.delete('/api/corrections/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const deleted = db.removeCorrection(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Correction not found' });
    }

    res.json({ success: true, message: 'Correction deleted' });
  } catch (error) {
    console.error('Error deleting correction:', error);
    res.status(500).json({
      error: 'Failed to delete correction',
      details: error.message
    });
  }
});

// ===== NEW ARTICLES ENDPOINTS =====

// GET all articles (overview)
app.get('/api/articles', (req, res) => {
  if (!serverReady) {
    return res.status(503).json({ error: 'Server is initializing' });
  }

  try {
    const articles = db.listArticles();
    res.json(articles);
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({
      error: 'Failed to fetch articles',
      details: error.message
    });
  }
});

// GET single article with all runs
app.get('/api/articles/:url(*)', (req, res) => {
  if (!serverReady) {
    return res.status(503).json({ error: 'Server is initializing' });
  }

  try {
    // Decode URL parameter (may be URL-encoded from frontend)
    const url = decodeURIComponent(req.params.url);
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const article = db.getArticleWithRuns(url, page, pageSize);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json(article);
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({
      error: 'Failed to fetch article',
      details: error.message
    });
  }
});

// GET single correction run with full patch details
app.get('/api/runs/:runId', (req, res) => {
  if (!serverReady) {
    return res.status(503).json({ error: 'Server is initializing' });
  }

  try {
    const runId = parseInt(req.params.runId, 10);

    if (!runId) {
      return res.status(400).json({ error: 'Run ID is required' });
    }

    const run = db.getRunById(runId);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json(run);
  } catch (error) {
    console.error('Error fetching run:', error);
    res.status(500).json({
      error: 'Failed to fetch run',
      details: error.message
    });
  }
});

// POST gold standard for an article
app.post('/api/articles/:url(*)/gold-standard', (req, res) => {
  if (!serverReady) {
    return res.status(503).json({ error: 'Server is initializing' });
  }

  try {
    // Decode URL parameter (may be URL-encoded from frontend)
    const url = decodeURIComponent(req.params.url);
    const { title, lead, body, metadata } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!title && !body) {
      return res.status(400).json({
        error: 'At least one field (title or body) is required'
      });
    }

    const goldStandard = { title, lead, body };
    const result = db.saveGoldStandard(url, goldStandard, metadata);

    res.json({
      success: true,
      message: 'Gold standard saved successfully',
      conflicts: result.conflicts
    });
  } catch (error) {
    console.error('Error saving gold standard:', error);
    res.status(500).json({
      error: 'Failed to save gold standard',
      details: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
