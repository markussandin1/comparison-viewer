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

  // Create articles table (new - container for all versions of an article)
  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
      url TEXT PRIMARY KEY,
      title TEXT,
      original_article TEXT NOT NULL,
      gold_standard_title TEXT,
      gold_standard_lead TEXT,
      gold_standard_body TEXT,
      gold_standard_uploaded_at DATETIME,
      gold_standard_metadata TEXT,
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create corrections table (will be used as correction_runs)
  db.run(`
    CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT,
      article_url TEXT,
      source_url TEXT,
      run_number INTEGER,
      original_article TEXT NOT NULL,
      corrected_article TEXT NOT NULL,
      applied TEXT,
      unapplied TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Run migrations
  await runMigrations();

  // Save to disk
  saveDatabase();
}

// Run database migrations
async function runMigrations() {
  try {
    const tableInfo = db.exec("PRAGMA table_info(corrections)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(col => col[1]);

      // Migration 1: Add source_url column if it doesn't exist
      if (!columns.includes('source_url')) {
        console.log('Migration: Adding source_url column to corrections table');
        db.run('ALTER TABLE corrections ADD COLUMN source_url TEXT');
        saveDatabase();
      }

      // Migration 2: Add article_url column if it doesn't exist
      if (!columns.includes('article_url')) {
        console.log('Migration: Adding article_url column to corrections table');
        db.run('ALTER TABLE corrections ADD COLUMN article_url TEXT');
        saveDatabase();
      }

      // Migration 3: Add run_number column if it doesn't exist
      if (!columns.includes('run_number')) {
        console.log('Migration: Adding run_number column to corrections table');
        db.run('ALTER TABLE corrections ADD COLUMN run_number INTEGER');
        saveDatabase();
      }

      // Migration 4: Populate article_url from original_article.url for existing records
      const needsUrlMigration = db.exec(`
        SELECT COUNT(*) FROM corrections WHERE article_url IS NULL
      `);

      if (needsUrlMigration[0]?.values[0][0] > 0) {
        console.log('Migration: Populating article_url from original_article.url');
        const corrections = db.exec('SELECT id, original_article FROM corrections WHERE article_url IS NULL');

        if (corrections.length > 0 && corrections[0].values.length > 0) {
          corrections[0].values.forEach(row => {
            const id = row[0];
            const originalArticle = JSON.parse(row[1]);
            const url = originalArticle?.url;

            if (url) {
              db.run('UPDATE corrections SET article_url = ? WHERE id = ?', [url, id]);
            }
          });
          saveDatabase();
        }
      }

      // Migration 5: Create articles entries from existing corrections
      console.log('Migration: Creating articles from existing corrections');
      const urls = db.exec(`
        SELECT DISTINCT article_url
        FROM corrections
        WHERE article_url IS NOT NULL
        AND article_url NOT IN (SELECT url FROM articles)
      `);

      if (urls.length > 0 && urls[0].values.length > 0) {
        urls[0].values.forEach(row => {
          const url = row[0];

          // Get first correction for this URL
          const firstCorrection = db.exec(`
            SELECT original_article, created_at
            FROM corrections
            WHERE article_url = ?
            ORDER BY created_at ASC
            LIMIT 1
          `, [url]);

          if (firstCorrection.length > 0 && firstCorrection[0].values.length > 0) {
            const originalArticle = JSON.parse(firstCorrection[0].values[0][0]);
            const createdAt = firstCorrection[0].values[0][1];
            const title = originalArticle?.title || null;

            db.run(`
              INSERT OR IGNORE INTO articles (url, title, original_article, first_seen, last_updated)
              VALUES (?, ?, ?, ?, ?)
            `, [url, title, firstCorrection[0].values[0][0], createdAt, createdAt]);
          }
        });
        saveDatabase();
      }

      // Migration 6: Populate run_number for existing corrections
      console.log('Migration: Populating run_number for existing corrections');
      const articlesWithCorrections = db.exec(`
        SELECT DISTINCT article_url FROM corrections WHERE article_url IS NOT NULL
      `);

      if (articlesWithCorrections.length > 0 && articlesWithCorrections[0].values.length > 0) {
        articlesWithCorrections[0].values.forEach(row => {
          const url = row[0];

          // Get all corrections for this URL ordered by created_at
          const correctionsForUrl = db.exec(`
            SELECT id FROM corrections
            WHERE article_url = ?
            ORDER BY created_at ASC
          `, [url]);

          if (correctionsForUrl.length > 0 && correctionsForUrl[0].values.length > 0) {
            correctionsForUrl[0].values.forEach((corrRow, index) => {
              const corrId = corrRow[0];
              db.run('UPDATE corrections SET run_number = ? WHERE id = ?', [index + 1, corrId]);
            });
          }
        });
        saveDatabase();
      }

      // Migration 7: Create index for faster queries (after column exists)
      console.log('Migration: Creating index on article_url');
      db.run(`CREATE INDEX IF NOT EXISTS idx_corrections_url ON corrections(article_url)`);
      saveDatabase();
    }
  } catch (e) {
    console.error('Migration error:', e);
  }
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

  const articleUrl = originalArticle.url;

  // Create or update article entry if URL exists
  if (articleUrl) {
    const existingArticle = getArticleByUrl(articleUrl);

    if (!existingArticle) {
      // Create new article entry
      db.run(`
        INSERT INTO articles (url, title, original_article, first_seen, last_updated)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `, [
        articleUrl,
        originalArticle.title || null,
        JSON.stringify(originalArticle)
      ]);
    } else {
      // Update title, original_article, and timestamp to keep them in sync with latest run
      db.run(`
        UPDATE articles
        SET title = ?,
            original_article = ?,
            last_updated = datetime('now')
        WHERE url = ?
      `, [
        originalArticle.title || null,
        JSON.stringify(originalArticle),
        articleUrl
      ]);
    }

    // Get next run_number for this article
    const runNumberResult = db.exec(`
      SELECT COALESCE(MAX(run_number), 0) + 1 as next_run
      FROM corrections
      WHERE article_url = ?
    `, [articleUrl]);

    const runNumber = runNumberResult[0]?.values[0][0] || 1;

    // Insert correction with article_url and run_number
    db.run(
      `INSERT INTO corrections (article_id, article_url, run_number, original_article, corrected_article, applied, unapplied)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        Array.isArray(data.article_id) ? data.article_id[0] : (data.article_id || null),
        articleUrl,
        runNumber,
        JSON.stringify(originalArticle),
        JSON.stringify(correctedArticle),
        JSON.stringify(Array.isArray(data.applied) ? data.applied : []),
        JSON.stringify(Array.isArray(data.unapplied) ? data.unapplied : [])
      ]
    );
  } else {
    // Fallback: insert without article_url (backward compatibility)
    db.run(
      `INSERT INTO corrections (article_id, original_article, corrected_article, applied, unapplied)
       VALUES (?, ?, ?, ?, ?)`,
      [
        Array.isArray(data.article_id) ? data.article_id[0] : (data.article_id || null),
        JSON.stringify(originalArticle),
        JSON.stringify(correctedArticle),
        JSON.stringify(Array.isArray(data.applied) ? data.applied : []),
        JSON.stringify(Array.isArray(data.unapplied) ? data.unapplied : [])
      ]
    );
  }

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
    SELECT id, article_id, original_article, created_at
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
      const originalArticle = JSON.parse(row[2]);
      title = originalArticle?.title || null;
      articleUrl = originalArticle?.url || null;
    } catch (e) {
      // Ignore parse errors
    }

    return {
      id: row[0],
      article_id: row[1],
      title: title,
      url: articleUrl,
      source: extractSource(articleUrl),
      created_at: row[3] + 'Z' // Mark as UTC
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

// Articles functions
function listArticles() {
  const result = db.exec(`
    SELECT
      a.url,
      a.title,
      a.gold_standard_title IS NOT NULL as has_gold_standard,
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

function getArticleByUrl(url) {
  const result = db.exec(`
    SELECT * FROM articles WHERE url = ?
  `, [url]);

  if (!result.length || !result[0].values.length) {
    return null;
  }

  const row = result[0].values[0];
  const columns = result[0].columns;

  const article = {
    url: row[columns.indexOf('url')],
    title: row[columns.indexOf('title')],
    original_article: JSON.parse(row[columns.indexOf('original_article')]),
    gold_standard: null,
    gold_standard_uploaded_at: row[columns.indexOf('gold_standard_uploaded_at')],
    gold_standard_metadata: row[columns.indexOf('gold_standard_metadata')],
    first_seen: row[columns.indexOf('first_seen')] + 'Z',
    last_updated: row[columns.indexOf('last_updated')] + 'Z'
  };

  // Construct gold_standard object if it exists
  const goldTitle = row[columns.indexOf('gold_standard_title')];
  const goldLead = row[columns.indexOf('gold_standard_lead')];
  const goldBody = row[columns.indexOf('gold_standard_body')];

  if (goldTitle !== null || goldLead !== null || goldBody !== null) {
    article.gold_standard = {
      title: goldTitle,
      lead: goldLead,
      body: goldBody
    };
  }

  if (article.gold_standard_uploaded_at) {
    article.gold_standard_uploaded_at += 'Z';
  }

  if (article.gold_standard_metadata) {
    try {
      article.gold_standard_metadata = JSON.parse(article.gold_standard_metadata);
    } catch (e) {
      // Keep as string if parse fails
    }
  }

  return article;
}

function getArticleWithRuns(url, page = 1, pageSize = 10) {
  const article = getArticleByUrl(url);
  if (!article) return null;

  // Get total run count for pagination
  const countResult = db.exec(`SELECT COUNT(*) FROM corrections WHERE article_url = ?`, [url]);
  const totalRuns = countResult[0]?.values[0][0] || 0;
  const totalPages = Math.ceil(totalRuns / pageSize);
  const offset = (page - 1) * pageSize;

  // Get all correction runs for this article (metadata only for performance)
  const runsResult = db.exec(`
    SELECT
      id, run_number, created_at
    FROM corrections
    WHERE article_url = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [url, pageSize, offset]);

  const runs = [];
  if (runsResult.length > 0 && runsResult[0].values.length > 0) {
    runsResult[0].values.forEach((row) => {
      const run = {
        id: row[0],
        run_number: row[1],
        created_at: row[2] + 'Z'
      };

      // Note: Full run details (original_article, corrected_article, patches)
      // available via GET /api/runs/:runId

      runs.push(run);
    });
  }

  article.runs = runs;

  article.pagination = {
    totalRuns,
    totalPages,
    currentPage: page,
    pageSize
  };

  // Note: recommended_run_id calculation removed for performance
  // Can be calculated when fetching individual run details

  return article;
}

function getRunById(runId) {
  const runResult = db.exec(`
    SELECT
      id, run_number, article_url, original_article, corrected_article,
      applied, unapplied, created_at
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
    original_article: JSON.parse(row[3]),
    corrected_article: JSON.parse(row[4]),
    applied: JSON.parse(row[5]),
    unapplied: JSON.parse(row[6]),
    created_at: row[7] + 'Z'
  };

  // Calculate metrics if gold standard exists for this article
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

function saveGoldStandard(url, goldStandard, metadata) {
  // First, check if article exists (without loading full original_article)
  const articleCheck = db.exec(`SELECT url FROM articles WHERE url = ?`, [url]);

  if (!articleCheck.length || !articleCheck[0].values.length) {
    throw new Error('Article not found. Please create at least one correction run first.');
  }

  // Skip conflict checking to avoid memory issues with large articles
  // Conflicts can be checked on frontend if needed
  const conflicts = [];

  db.run(`
    UPDATE articles
    SET
      gold_standard_title = ?,
      gold_standard_lead = ?,
      gold_standard_body = ?,
      gold_standard_uploaded_at = datetime('now'),
      gold_standard_metadata = ?
    WHERE url = ?
  `, [
    goldStandard.title || null,
    goldStandard.lead || null,
    goldStandard.body || null,
    JSON.stringify(metadata || {}),
    url
  ]);

  saveDatabase();

  return { success: true, conflicts };
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
