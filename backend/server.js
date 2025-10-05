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

    // Save to database
    const id = db.saveCorrection(data);

    res.status(201).json({
      success: true,
      id,
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
