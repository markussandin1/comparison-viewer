# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Correction Viewer is a fullstack application for evaluating and comparing AI agent correction suggestions on articles. It features:
- Article-centric organization (group multiple correction runs per article)
- Gold standard comparison with metrics (F1-score, precision, recall)
- Flexible multi-run comparison with diff highlighting
- Side-by-side visualization with Myers diff algorithm

**Architecture:**
- Frontend: React + Vite + TailwindCSS (SPA with React Router)
- Backend: Express.js REST API
- Database: sql.js (SQLite with file persistence)
- Deployment: Google Cloud Run via GitHub Actions

**Production URLs:**
- Backend API: `https://correction-viewer-backend-qpfdynkt7a-lz.a.run.app`
- Frontend: `https://correction-viewer-frontend-qpfdynkt7a-lz.a.run.app`

Note: Both `-qpfdynkt7a-lz` and `-128915563719` URLs point to the same services.

## Development Commands

### Backend
```bash
cd backend
npm install
npm run dev    # Start with nodemon on port 3001
npm start      # Production start
```

### Frontend
```bash
npm install
npm run dev      # Vite dev server on port 5173
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

## Architecture Details

### Data Flow
1. AI agents POST corrections to `/api/corrections` with article URL
2. Backend auto-creates articles and groups runs by URL
3. Backend calculates metrics when gold standard exists
4. Frontend displays article list, detail view, and comparison views
5. Myers diff algorithm computes word-level diffs for visualization

### Database Schema

**Table: `articles`**
- `url` (TEXT PRIMARY KEY) - Article URL
- `title` (TEXT) - Latest article title
- `original_article` (TEXT, JSON) - Original article content
- `gold_standard_title` (TEXT) - Gold standard title
- `gold_standard_lead` (TEXT) - Gold standard lead
- `gold_standard_body` (TEXT) - Gold standard body
- `gold_standard_uploaded_at` (DATETIME)
- `gold_standard_metadata` (TEXT, JSON) - Corrector name, notes
- `first_seen` (DATETIME)
- `last_updated` (DATETIME)

**Table: `corrections`**
- `id` (INTEGER PRIMARY KEY)
- `article_id` (TEXT) - Legacy field
- `article_url` (TEXT) - Links to articles.url
- `run_number` (INTEGER) - Auto-incremented per article
- `original_article` (TEXT, JSON)
- `corrected_article` (TEXT, JSON)
- `applied` (TEXT, JSON array)
- `unapplied` (TEXT, JSON array)
- `created_at` (DATETIME)

**Database persistence:**
- Development: `backend/corrections.db`
- Production: `/app/data/corrections.db`
- Uses sql.js (in-memory SQLite) with file persistence

### API Endpoints

**Corrections:**
- `POST /api/corrections` - Create correction (auto-creates article, increments run_number)
- `GET /api/corrections` - List all corrections
- `GET /api/corrections/:id` - Get full correction details

**Articles:**
- `GET /api/articles` - List all articles with metrics
- `GET /api/articles/:url(*)` - Get article with all runs and calculated metrics
- `POST /api/articles/:url(*)/gold-standard` - Upload gold standard

**Health:**
- `GET /health` - Health check

### Frontend Routes & Components

**Routes:**
- `/` - ArticlesList (article overview with filters)
- `/article/:url` - ArticleDetail (single article with all runs)
- `/article/:url/compare` - MultiRunComparison (flexible multi-version comparison)
- `/correction/:id` - CorrectionViewer (single correction with checkbox selection)

**Key Components:**
- `ArticlesList` - Article overview with filters (all, with gold, without gold)
- `ArticleDetail` - Article detail page with runs list and gold standard upload
- `MultiRunComparison` - Dropdown-based multi-column comparison (1-4 columns)
- `CorrectionViewer` - Checkbox-based comparison (Original/Corrected/Gold)
- `GoldStandardForm` - Three-field form (title, lead, body) with conflict detection

### Metrics Calculation

Implemented in `backend/metrics.js`:
- **F1-Score** - Harmonic mean of precision and recall
- **Precision** - True positives / (true positives + false positives)
- **Recall** - True positives / (true positives + false negatives)
- **Similarity** - Levenshtein distance based similarity (0-1)
- **Run-to-run similarity** - Compare consecutive runs

Metrics are calculated on-demand when fetching articles with gold standards.

### Deployment

**GitHub Actions workflow** (`.github/workflows/deploy.yml`):
- Project ID: `text-comparison-474220`
- Region: `europe-north1`
- Auto-deploys on push to main branch
- Backend deployed from `./backend` directory
- Frontend deployed from root with backend URL injected

**Manual deployment:**
```bash
# Backend
gcloud run deploy correction-viewer-backend \
  --source ./backend \
  --platform managed \
  --region europe-north1 \
  --allow-unauthenticated \
  --port 3001 \
  --project text-comparison-474220

# Frontend (after backend is deployed)
BACKEND_URL=$(gcloud run services describe correction-viewer-backend \
  --region europe-north1 \
  --project text-comparison-474220 \
  --format 'value(status.url)')

docker build --build-arg VITE_API_URL=$BACKEND_URL -t europe-north1-docker.pkg.dev/text-comparison-474220/cloud-run-source-deploy/correction-viewer-frontend .
docker push europe-north1-docker.pkg.dev/text-comparison-474220/cloud-run-source-deploy/correction-viewer-frontend
gcloud run deploy correction-viewer-frontend \
  --image europe-north1-docker.pkg.dev/text-comparison-474220/cloud-run-source-deploy/correction-viewer-frontend \
  --platform managed \
  --region europe-north1 \
  --allow-unauthenticated \
  --port 80 \
  --project text-comparison-474220
```

## Important Implementation Details

### Diff Algorithm
Uses Myers algorithm (`myersDiff` function) for efficient word-level diffing. Tokenizes on whitespace and punctuation. Produces `equal`, `insert`, and `delete` operations for accurate highlighting.

### Article Data Structure
```javascript
{
  "article_id": "string (optional)",
  "original_article": {
    "url": "https://www.example.com/article",
    "title": "string",
    "lead": "string (optional)",
    "body": ["array", "of", "paragraphs"] | "string"
  },
  "corrected_article": {
    "title": "string",
    "lead": "string (optional)",
    "body": ["array", "of", "paragraphs"]
  },
  "applied": [
    {
      "agent": "agent-name@version",
      "path": "title|lead|body[n]",
      "before": "original text",
      "after": "corrected text"
    }
  ],
  "unapplied": [
    {
      "agent": "agent-name",
      "path": "string",
      "reason": "why change was not applied"
    }
  ]
}
```

### Gold Standard Format
Gold standard is stored as three separate text fields (not JSON) to match copy-paste workflow from Google Docs/CMS:
```javascript
{
  "title": "Corrected title as plain text",
  "lead": "Corrected lead as plain text",
  "body": "Corrected body as plain text (paragraphs separated by \\n\\n)",
  "metadata": {
    "corrector": "Person name (optional)",
    "notes": "Notes about corrections (optional)"
  }
}
```

### Recommended Run Selection
When gold standard exists, the system automatically recommends the run with the highest F1-score. This run is highlighted with a green border and "⭐ Recommended" badge.

### Environment Variables
- Frontend: `VITE_API_URL` - Backend API URL (default: http://localhost:3001)
- Backend: `PORT` - Server port (default: 3001)
- Backend: `NODE_ENV` - Production flag (affects DB path)

### Database Migrations
`database.js` includes automatic migrations that run on server start. Existing migrations:
1. Add `source_url` column to corrections
2. Migrate data from old URL formats
3. Create articles table
4. Add article_url and run_number to corrections
5. Populate articles from existing corrections
6. Add gold standard fields to articles
7. Create indexes for performance

## Testing with Sample Data

Sample test file: `test-correction3.json`
```bash
# Post to API
curl -X POST http://localhost:3001/api/corrections \
  -H "Content-Type: application/json" \
  -d @test-correction3.json
```
