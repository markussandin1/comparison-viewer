const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./database');

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
    const data = req.body;

    // Validate required fields
    if (!data.corrected_article) {
      return res.status(400).json({
        error: 'Missing required field: corrected_article'
      });
    }

    // Validate that we have meaningful content
    const hasContent =
      (data.corrected_article.body &&
       ((Array.isArray(data.corrected_article.body) && data.corrected_article.body.length > 0) ||
        (typeof data.corrected_article.body === 'string' && data.corrected_article.body.trim().length > 0))) ||
      (data.original_article?.body &&
       typeof data.original_article.body === 'string' &&
       data.original_article.body.trim().length > 0);

    if (!hasContent) {
      return res.status(400).json({
        error: 'Correction must have content in body field'
      });
    }

    // Save to database
    const id = db.saveCorrection(data);

    // Get frontend URL from environment or use default
    const frontendUrl = process.env.FRONTEND_URL || 'https://correction-viewer-frontend-qpfdynkt7a-lz.a.run.app';
    const correctionUrl = `${frontendUrl}/correction/${id}`;

    res.status(201).json({
      success: true,
      id,
      url: correctionUrl,
      message: 'Correction saved successfully'
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
    const url = req.params.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const article = db.getArticleWithRuns(url);

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

// POST gold standard for an article
app.post('/api/articles/:url(*)/gold-standard', (req, res) => {
  if (!serverReady) {
    return res.status(503).json({ error: 'Server is initializing' });
  }

  try {
    const url = req.params.url;
    const { title, lead, body, metadata } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!title && !lead && !body) {
      return res.status(400).json({
        error: 'At least one field (title, lead, or body) is required'
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
