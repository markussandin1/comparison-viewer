const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Use /app/data for persistent storage in Docker, otherwise use local directory
const dbDir = process.env.NODE_ENV === 'production' ? '/app/data' : __dirname;
const dbPath = path.join(dbDir, 'corrections.db');

let db;

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT,
      source_url TEXT,
      original_article TEXT NOT NULL,
      corrected_article TEXT NOT NULL,
      applied TEXT,
      unapplied TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add source_url column if it doesn't exist
  try {
    const tableInfo = db.exec("PRAGMA table_info(corrections)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(col => col[1]); // column name is at index 1
      if (!columns.includes('source_url')) {
        console.log('Adding source_url column to corrections table');
        db.run('ALTER TABLE corrections ADD COLUMN source_url TEXT');
        saveDatabase();
      }
    }
  } catch (e) {
    console.error('Migration error:', e);
  }

  // Save to disk
  saveDatabase();
}

// Save database to disk
function saveDatabase() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Database functions
function saveCorrection(data) {
  // Parse body if it's a string
  let originalArticle = data.original_article || {};
  let correctedArticle = data.corrected_article || {};

  if (originalArticle.body && typeof originalArticle.body === 'string') {
    try {
      originalArticle.body = JSON.parse(originalArticle.body);
    } catch (e) {
      console.warn('Failed to parse original_article.body as JSON:', e);
    }
  }

  if (correctedArticle.body && typeof correctedArticle.body === 'string') {
    try {
      correctedArticle.body = JSON.parse(correctedArticle.body);
    } catch (e) {
      console.warn('Failed to parse corrected_article.body as JSON:', e);
    }
  }

  db.run(
    `INSERT INTO corrections (article_id, source_url, original_article, corrected_article, applied, unapplied)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      Array.isArray(data.article_id) ? data.article_id[0] : (data.article_id || null),
      data.source_url || null,
      JSON.stringify(originalArticle),
      JSON.stringify(correctedArticle),
      JSON.stringify(Array.isArray(data.applied) ? data.applied : []),
      JSON.stringify(Array.isArray(data.unapplied) ? data.unapplied : [])
    ]
  );

  saveDatabase();

  // Get last inserted ID
  const result = db.exec('SELECT MAX(id) as id FROM corrections');
  return result[0].values[0][0];
}

// Extract domain from URL
function extractSource(sourceUrl) {
  if (!sourceUrl) return null;

  try {
    // Check if it's a URL
    if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
      const url = new URL(sourceUrl);
      // Remove www. prefix if present
      return url.hostname.replace(/^www\./, '');
    }
  } catch (e) {
    // Not a valid URL
  }

  return null;
}

function listCorrections() {
  const result = db.exec(`
    SELECT id, article_id, source_url, original_article, created_at
    FROM corrections
    ORDER BY created_at DESC
  `);

  if (!result.length || !result[0].values.length) {
    return [];
  }

  return result[0].values.map(row => {
    let title = null;
    let articleUrl = null;
    try {
      const originalArticle = JSON.parse(row[3]);
      title = originalArticle?.title || null;
      articleUrl = originalArticle?.url || null;
    } catch (e) {
      // Ignore parse errors
    }

    // Priority: source_url field, then original_article.url
    const sourceForExtraction = row[2] || articleUrl;

    return {
      id: row[0],
      article_id: row[1],
      source_url: row[2],
      title: title,
      source: extractSource(sourceForExtraction),
      created_at: row[4] + 'Z' // Mark as UTC
    };
  });
}

function getCorrection(id) {
  const result = db.exec(`
    SELECT * FROM corrections WHERE id = ?
  `, [id]);

  if (!result.length || !result[0].values.length) {
    return null;
  }

  const row = result[0].values[0];
  const columns = result[0].columns;

  return {
    id: row[columns.indexOf('id')],
    article_id: row[columns.indexOf('article_id')],
    original_article: JSON.parse(row[columns.indexOf('original_article')]),
    corrected_article: JSON.parse(row[columns.indexOf('corrected_article')]),
    applied: JSON.parse(row[columns.indexOf('applied')]),
    unapplied: JSON.parse(row[columns.indexOf('unapplied')]),
    created_at: row[columns.indexOf('created_at')] + 'Z' // Mark as UTC
  };
}

function removeCorrection(id) {
  const result = db.exec(`SELECT COUNT(*) FROM corrections WHERE id = ?`, [id]);
  const exists = result[0].values[0][0] > 0;

  if (!exists) {
    return false;
  }

  db.run('DELETE FROM corrections WHERE id = ?', [id]);
  saveDatabase();
  return true;
}

module.exports = {
  initDatabase,
  saveCorrection,
  listCorrections,
  getCorrection,
  removeCorrection
};
