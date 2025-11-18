const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const metrics = require('./metrics');

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

  // Create articles table
  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
      url TEXT PRIMARY KEY,
      title TEXT,
      original_article TEXT NOT NULL,
      gold_standard TEXT,
      gold_standard_uploaded_at DATETIME,
      gold_standard_metadata TEXT,
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create corrections table
  db.run(`
    CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_url TEXT NOT NULL,
      run_number INTEGER,
      original_article TEXT NOT NULL,
      corrected_article TEXT NOT NULL,
      merged_changes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_url) REFERENCES articles(url)
    )
  `);

  // Create index for faster queries
  db.run(`CREATE INDEX IF NOT EXISTS idx_corrections_url ON corrections(article_url)`);

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

// Save a new correction
function saveCorrection(data) {
  const articleUrl = data.article_url;
  const originalArticle = data.original_article;
  const correctedArticle = data.corrected_article;
  const mergedChanges = data.merged_changes;

  // Extract title from first line of original_article
  const title = originalArticle.split('\n')[0].substring(0, 200);

  // Create or update article entry
  const existingArticle = getArticleByUrl(articleUrl);

  if (!existingArticle) {
    // Create new article entry
    db.run(`
      INSERT INTO articles (url, title, original_article, first_seen, last_updated)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `, [articleUrl, title, originalArticle]);
  } else {
    // Update article with latest original
    db.run(`
      UPDATE articles
      SET title = ?,
          original_article = ?,
          last_updated = datetime('now')
      WHERE url = ?
    `, [title, originalArticle, articleUrl]);
  }

  // Get next run_number for this article
  const runNumberResult = db.exec(`
    SELECT COALESCE(MAX(run_number), 0) + 1 as next_run
    FROM corrections
    WHERE article_url = ?
  `, [articleUrl]);

  const runNumber = runNumberResult[0]?.values[0][0] || 1;

  // Insert correction
  db.run(
    `INSERT INTO corrections (article_url, run_number, original_article, corrected_article, merged_changes)
     VALUES (?, ?, ?, ?, ?)`,
    [
      articleUrl,
      runNumber,
      originalArticle,
      correctedArticle,
      JSON.stringify(mergedChanges)
    ]
  );

  saveDatabase();

  // Get last inserted ID
  const result = db.exec('SELECT MAX(id) as id FROM corrections');
  return result[0].values[0][0];
}

// List all corrections
function listCorrections() {
  const result = db.exec(`
    SELECT id, article_url, original_article, created_at
    FROM corrections
    ORDER BY created_at DESC
  `);

  if (!result.length || !result[0].values.length) {
    return [];
  }

  return result[0].values.map(row => {
    // Extract title from first line
    const title = row[2].split('\n')[0].substring(0, 200);

    return {
      id: row[0],
      url: row[1],
      title: title,
      created_at: row[3] + 'Z'
    };
  });
}

// Get a single correction by ID
function getCorrection(id) {
  const result = db.exec(`
    SELECT id, article_url, run_number, original_article, corrected_article, merged_changes, created_at
    FROM corrections WHERE id = ?
  `, [id]);

  if (!result.length || !result[0].values.length) {
    return null;
  }

  const row = result[0].values[0];

  return {
    id: row[0],
    article_url: row[1],
    run_number: row[2],
    original_article: row[3],
    corrected_article: row[4],
    merged_changes: row[5] ? JSON.parse(row[5]) : [],
    created_at: row[6] + 'Z'
  };
}

// Remove a correction
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

// List all articles
function listArticles() {
  const result = db.exec(`
    SELECT
      a.url,
      a.title,
      a.gold_standard IS NOT NULL as has_gold_standard,
      a.first_seen,
      a.last_updated,
      COUNT(c.id) as run_count,
      MAX(c.created_at) as latest_run_at
    FROM articles a
    LEFT JOIN corrections c ON a.url = c.article_url
    GROUP BY a.url
    ORDER BY a.last_updated DESC
  `);

  if (!result.length || !result[0].values.length) {
    return [];
  }

  return result[0].values.map(row => ({
    url: row[0],
    title: row[1],
    has_gold_standard: Boolean(row[2]),
    first_seen: row[3] + 'Z',
    last_updated: row[4] + 'Z',
    run_count: row[5] || 0,
    latest_run_at: row[6] ? row[6] + 'Z' : null
  }));
}

// Get article by URL
function getArticleByUrl(url) {
  const result = db.exec(`
    SELECT url, title, original_article, gold_standard, gold_standard_uploaded_at, gold_standard_metadata, first_seen, last_updated
    FROM articles WHERE url = ?
  `, [url]);

  if (!result.length || !result[0].values.length) {
    return null;
  }

  const row = result[0].values[0];

  const article = {
    url: row[0],
    title: row[1],
    original_article: row[2],
    gold_standard: row[3],
    gold_standard_uploaded_at: row[4] ? row[4] + 'Z' : null,
    gold_standard_metadata: null,
    first_seen: row[6] + 'Z',
    last_updated: row[7] + 'Z'
  };

  if (row[5]) {
    try {
      article.gold_standard_metadata = JSON.parse(row[5]);
    } catch (e) {
      // Keep as null if parse fails
    }
  }

  return article;
}

// Get article with all runs
function getArticleWithRuns(url, page = 1, pageSize = 10) {
  const article = getArticleByUrl(url);
  if (!article) return null;

  // Get total run count for pagination
  const countResult = db.exec(`SELECT COUNT(*) FROM corrections WHERE article_url = ?`, [url]);
  const totalRuns = countResult[0]?.values[0][0] || 0;
  const totalPages = Math.ceil(totalRuns / pageSize);
  const offset = (page - 1) * pageSize;

  // Get correction runs for this article
  const runsResult = db.exec(`
    SELECT id, run_number, created_at
    FROM corrections
    WHERE article_url = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [url, pageSize, offset]);

  const runs = [];
  if (runsResult.length > 0 && runsResult[0].values.length > 0) {
    runsResult[0].values.forEach((row) => {
      runs.push({
        id: row[0],
        run_number: row[1],
        created_at: row[2] + 'Z'
      });
    });
  }

  article.runs = runs;
  article.pagination = {
    totalRuns,
    totalPages,
    currentPage: page,
    pageSize
  };

  return article;
}

// Get a single run by ID
function getRunById(runId) {
  const runResult = db.exec(`
    SELECT id, run_number, article_url, original_article, corrected_article, merged_changes, created_at
    FROM corrections
    WHERE id = ?
  `, [runId]);

  if (runResult.length === 0 || runResult[0].values.length === 0) {
    return null;
  }

  const row = runResult[0].values[0];
  const run = {
    id: row[0],
    run_number: row[1],
    article_url: row[2],
    original_article: row[3],
    corrected_article: row[4],
    merged_changes: row[5] ? JSON.parse(row[5]) : [],
    created_at: row[6] + 'Z'
  };

  // Calculate metrics if gold standard exists
  const article = getArticleByUrl(run.article_url);
  if (article && article.gold_standard) {
    run.metrics = metrics.calculateRunMetrics(
      run,
      article.gold_standard,
      article.original_article
    );
  }

  return run;
}

// Save gold standard for an article
function saveGoldStandard(url, goldStandardText, metadata) {
  // Check if article exists
  const articleCheck = db.exec(`SELECT url FROM articles WHERE url = ?`, [url]);

  if (!articleCheck.length || !articleCheck[0].values.length) {
    throw new Error('Article not found. Please create at least one correction run first.');
  }

  db.run(`
    UPDATE articles
    SET
      gold_standard = ?,
      gold_standard_uploaded_at = datetime('now'),
      gold_standard_metadata = ?
    WHERE url = ?
  `, [
    goldStandardText,
    JSON.stringify(metadata || {}),
    url
  ]);

  saveDatabase();

  return { success: true };
}

module.exports = {
  initDatabase,
  saveCorrection,
  listCorrections,
  getCorrection,
  removeCorrection,
  listArticles,
  getArticleByUrl,
  getArticleWithRuns,
  getRunById,
  saveGoldStandard
};
