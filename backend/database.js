const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use /app/data for persistent storage in Docker, otherwise use local directory
const dbDir = process.env.NODE_ENV === 'production' ? '/app/data' : __dirname;
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database
const db = new Database(path.join(dbDir, 'corrections.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id TEXT,
    original_article TEXT NOT NULL,
    corrected_article TEXT NOT NULL,
    applied TEXT,
    unapplied TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Prepared statements
const insertCorrection = db.prepare(`
  INSERT INTO corrections (article_id, original_article, corrected_article, applied, unapplied)
  VALUES (?, ?, ?, ?, ?)
`);

const getAllCorrections = db.prepare(`
  SELECT id, article_id, created_at
  FROM corrections
  ORDER BY created_at DESC
`);

const getCorrectionById = db.prepare(`
  SELECT * FROM corrections WHERE id = ?
`);

const deleteCorrection = db.prepare(`
  DELETE FROM corrections WHERE id = ?
`);

// Database functions
function saveCorrection(data) {
  const result = insertCorrection.run(
    data.article_id || null,
    JSON.stringify(data.original_article || {}),
    JSON.stringify(data.corrected_article || {}),
    JSON.stringify(data.applied || []),
    JSON.stringify(data.unapplied || [])
  );

  return result.lastInsertRowid;
}

function listCorrections() {
  return getAllCorrections.all();
}

function getCorrection(id) {
  const row = getCorrectionById.get(id);

  if (!row) return null;

  return {
    id: row.id,
    article_id: row.article_id,
    original_article: JSON.parse(row.original_article),
    corrected_article: JSON.parse(row.corrected_article),
    applied: JSON.parse(row.applied),
    unapplied: JSON.parse(row.unapplied),
    created_at: row.created_at
  };
}

function removeCorrection(id) {
  const result = deleteCorrection.run(id);
  return result.changes > 0;
}

module.exports = {
  saveCorrection,
  listCorrections,
  getCorrection,
  removeCorrection
};
