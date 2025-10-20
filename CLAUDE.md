# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Correction Viewer is a fullstack application for visualizing and comparing AI agent correction suggestions. It displays original vs corrected article text side-by-side with diff highlighting.

**Architecture:**
- Frontend: React + Vite + TailwindCSS (SPA with client-side routing)
- Backend: Express.js REST API
- Database: sql.js (SQLite in-memory with file persistence)
- Deployment: Google Cloud Run via GitHub Actions
- GCP Project ID: text-comparison-474220
- Region: europe-north1

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
1. AI agents POST corrections to `/api/corrections`
2. Backend stores in SQLite (sql.js with file persistence)
3. Frontend fetches corrections list and displays individual correction details
4. Myers diff algorithm computes word-level diffs for visualization

### Database Schema
Table: `corrections`
- `id` (INTEGER PRIMARY KEY)
- `article_id` (TEXT)
- `source_url` (TEXT) - Added via migration
- `original_article` (TEXT, JSON)
- `corrected_article` (TEXT, JSON)
- `applied` (TEXT, JSON array)
- `unapplied` (TEXT, JSON array)
- `created_at` (DATETIME)

**Important:** Database uses sql.js (in-memory SQLite) with file persistence to `/app/data/corrections.db` in production, `backend/corrections.db` in development.

### Frontend Components
- `CorrectionViewer` - Main route component, manages state and API calls
- `CorrectionsList` - Sidebar with filterable list (by source)
- `SplitScreenField` - Side-by-side diff view for title/lead/body
- `PatchesTable` - Table showing applied/unapplied changes
- `computeWordDiff` - Myers algorithm implementation for accurate word-level diffs

### API Endpoints
- `POST /api/corrections` - Create correction (returns URL)
- `GET /api/corrections` - List all corrections (summary view)
- `GET /api/corrections/:id` - Get full correction details
- `DELETE /api/corrections/:id` - Delete correction
- `GET /health` - Health check

### Deployment

**GitHub Actions workflow** (`.github/workflows/deploy.yml`):
1. Deploys backend to Cloud Run from `./backend` directory
2. Deploys frontend to Cloud Run from root directory
3. Automatically injects backend URL into frontend build

**Manual deployment:**
```bash
# Backend
cd backend
gcloud run deploy correction-viewer-backend \
  --source . \
  --platform managed \
  --region europe-north1 \
  --allow-unauthenticated \
  --port 3001 \
  --project text-comparison-474220

# Frontend
gcloud run deploy correction-viewer-frontend \
  --source . \
  --platform managed \
  --region europe-north1 \
  --allow-unauthenticated \
  --port 80 \
  --set-env-vars VITE_API_URL=<BACKEND_URL> \
  --project text-comparison-474220
```

## Important Implementation Details

### Diff Algorithm
Uses Myers algorithm (`myersDiff` function) for efficient, accurate word-level diffing. Tokens are split on whitespace and punctuation. The algorithm produces `equal`, `insert`, and `delete` operations.

### Article Data Structure
```javascript
{
  "article_id": "string",
  "original_article": {
    "title": "string",
    "lead": "string",
    "body": ["array", "of", "paragraphs"] | "string",
    "url": "string"  // Fallback source
  },
  "corrected_article": { /* same structure */ },
  "applied": [
    {
      "agent": "string",
      "path": "title|lead|body[n]",
      "before": "string",
      "after": "string"
    }
  ],
  "unapplied": [
    {
      "agent": "string",
      "path": "string",
      "before": "string",
      "after": "string",
      "reason": "string"
    }
  ]
}
```

### Source Extraction
Sources are extracted from `original_article.url` by parsing the hostname (removes `www.` prefix). Used for filtering in the UI.

### Environment Variables
- Frontend: `VITE_API_URL` - Backend API URL (default: http://localhost:3001)
- Backend: `PORT` - Server port (default: 3001)
- Backend: `NODE_ENV` - Production flag (affects DB path)
- Backend: `FRONTEND_URL` - Used in API response URLs

### Database Migrations
The `database.js` file includes migration logic to add new columns (e.g., `source_url`). Migrations run automatically on server start.
