# Correction Viewer

En applikation för att visualisera och jämföra AI-agenternas rättstavnings- och korrigeringsförslag.

## Features

- **Split-screen layout**: Jämför original och korrigerad text sida vid sida
- **Diff visualization**: Se exakt vad som ändrats med färgkodning
- **API för automatisk inmatning**: Posta corrections från dina AI-agenter
- **SQLite databas**: Spara och bläddra mellan alla corrections
- **Docker support**: Lätt att deploya till Google Cloud Run

## Projektstruktur

```
compare-edits/
├── backend/              # Express API server
│   ├── server.js        # API endpoints
│   ├── database.js      # SQLite databas-hantering
│   ├── package.json
│   └── Dockerfile
├── src/                 # React frontend
│   ├── main.jsx
│   └── ArticleDiffViewer.jsx
├── Dockerfile           # Frontend Docker build
├── nginx.conf          # Nginx konfiguration
└── package.json        # Frontend dependencies
```

## Lokal utveckling

### Backend

```bash
cd backend
npm install
npm run dev
```

Backend körs på `http://localhost:3001`

### Frontend

```bash
npm install
npm run dev
```

Frontend körs på `http://localhost:5173`

## API

### POST /api/corrections

Posta en ny correction från dina AI-agenter.

**Request body (JSON):**

```json
{
  "article_id": "abc123",
  "original_article": {
    "title": "Original titel",
    "lead": "Original ingress",
    "body": ["Stycke 1", "Stycke 2"]
  },
  "corrected_article": {
    "title": "Korrigerad titel",
    "lead": "Korrigerad ingress",
    "body": ["Korrigerat stycke 1", "Korrigerat stycke 2"]
  },
  "applied": [
    {
      "agent": "grammar",
      "path": "title",
      "before": "Original titel",
      "after": "Korrigerad titel"
    }
  ],
  "unapplied": [
    {
      "agent": "style",
      "path": "lead",
      "before": "något",
      "after": "någonting",
      "reason": "Too informal"
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "id": 1,
  "message": "Correction saved successfully"
}
```

### GET /api/corrections

Hämta lista över alla corrections.

**Response:**

```json
[
  {
    "id": 1,
    "article_id": "abc123",
    "created_at": "2025-10-05T12:34:56"
  }
]
```

### GET /api/corrections/:id

Hämta en specifik correction med alla detaljer.

**Response:**

```json
{
  "id": 1,
  "article_id": "abc123",
  "original_article": {...},
  "corrected_article": {...},
  "applied": [...],
  "unapplied": [...],
  "created_at": "2025-10-05T12:34:56"
}
```

### DELETE /api/corrections/:id

Ta bort en correction.

## Google Cloud Deployment

### Förberedelser

1. Installera [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. Logga in: `gcloud auth login`
3. Skapa ett projekt: `gcloud projects create [PROJECT_ID]`
4. Sätt aktivt projekt: `gcloud config set project [PROJECT_ID]`

### Deploy Backend till Cloud Run

```bash
cd backend

# Bygg och pusha Docker image
gcloud builds submit --tag gcr.io/[PROJECT_ID]/correction-viewer-backend

# Deploy till Cloud Run med persistent disk för SQLite
gcloud run deploy correction-viewer-backend \
  --image gcr.io/[PROJECT_ID]/correction-viewer-backend \
  --platform managed \
  --region europe-north1 \
  --allow-unauthenticated \
  --port 3001 \
  --execution-environment gen2 \
  --add-volume name=sqlite-data,type=cloud-storage,bucket=[BUCKET_NAME] \
  --add-volume-mount volume=sqlite-data,mount-path=/app/data
```

**Observera:** För produktion rekommenderas Cloud SQL istället för SQLite i Cloud Storage.

### Deploy Frontend till Cloud Run

```bash
# Från projektets root
gcloud builds submit --tag gcr.io/[PROJECT_ID]/correction-viewer-frontend

# Deploy
gcloud run deploy correction-viewer-frontend \
  --image gcr.io/[PROJECT_ID]/correction-viewer-frontend \
  --platform managed \
  --region europe-north1 \
  --allow-unauthenticated \
  --port 80 \
  --set-env-vars VITE_API_URL=[BACKEND_URL]
```

### Alternativ: Cloud Storage + Cloud Functions

För en enklare setup kan du:
- Deploya frontend som statisk site på Cloud Storage + Cloud CDN
- Deploya backend som Cloud Function

```bash
# Bygg frontend
npm run build

# Deploya till Cloud Storage
gsutil -m rsync -r dist gs://[BUCKET_NAME]

# Sätt bucket som public
gsutil iam ch allUsers:objectViewer gs://[BUCKET_NAME]
```

## GitHub Setup

```bash
# Initiera git repo
git init

# Lägg till remote
git remote add origin https://github.com/[USERNAME]/correction-viewer.git

# Skapa .gitignore om det inte finns
cat > .gitignore << 'EOF'
node_modules/
dist/
.env
*.db
.DS_Store
EOF

# Första commit
git add .
git commit -m "Initial commit: Correction Viewer MVP"

# Pusha till GitHub
git branch -M main
git push -u origin main
```

### GitHub Actions för CI/CD (valfritt)

Skapa `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [ main ]

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  REGION: europe-north1

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - id: auth
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Deploy to Cloud Run
        run: |
          gcloud builds submit backend/ --tag gcr.io/$PROJECT_ID/backend
          gcloud run deploy backend --image gcr.io/$PROJECT_ID/backend --region $REGION

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - id: auth
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Deploy to Cloud Run
        run: |
          gcloud builds submit . --tag gcr.io/$PROJECT_ID/frontend
          gcloud run deploy frontend --image gcr.io/$PROJECT_ID/frontend --region $REGION
```

## Miljövariabler

### Frontend (.env)

```
VITE_API_URL=http://localhost:3001
```

### Backend (.env)

```
PORT=3001
NODE_ENV=production
```

## Exempel: Posta från workflow-agent

```javascript
// Från din AI-agent workflow
const correctionData = {
  article_id: "article_123",
  original_article: originalArticle,
  corrected_article: mergedResult,
  applied: appliedPatches,
  unapplied: rejectedPatches
};

await fetch('https://your-backend-url.run.app/api/corrections', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(correctionData)
});
```

## Nästa steg

- [ ] Migrera från SQLite till Cloud SQL för bättre skalbarhet
- [ ] Lägg till autentisering (OAuth2)
- [ ] Exportera corrections till olika format (Word, PDF)
- [ ] Lägg till statistik och analytics dashboard
- [ ] Implementera feedback-loop till AI-agenterna

## Licens

MIT
