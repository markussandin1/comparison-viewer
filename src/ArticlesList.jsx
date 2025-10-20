import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function ArticlesList() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterGoldStandard, setFilterGoldStandard] = useState('all'); // 'all', 'with', 'without'
  const [sortBy, setSortBy] = useState('latest'); // 'latest', 'oldest', 'most_runs'

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/articles`);
      if (!response.ok) throw new Error('Failed to fetch articles');
      const data = await response.json();
      setArticles(data);
      setError('');
    } catch (err) {
      setError(`Error loading articles: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const extractDomain = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch (e) {
      return url;
    }
  };

  // Filter and sort articles
  const filteredAndSortedArticles = articles
    .filter(article => {
      if (filterGoldStandard === 'with') return article.has_gold_standard;
      if (filterGoldStandard === 'without') return !article.has_gold_standard;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'latest') {
        return new Date(b.last_updated) - new Date(a.last_updated);
      } else if (sortBy === 'oldest') {
        return new Date(a.first_seen) - new Date(b.first_seen);
      } else if (sortBy === 'most_runs') {
        return b.run_count - a.run_count;
      }
      return 0;
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Laddar artiklar...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Articles</h1>
          <p className="text-gray-600">
            Översikt över alla artiklar med rättningshistorik
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Gold Standard:</label>
              <select
                value={filterGoldStandard}
                onChange={(e) => setFilterGoldStandard(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Alla</option>
                <option value="with">Med gold standard</option>
                <option value="without">Utan gold standard</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Sortera:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="latest">Senast uppdaterad</option>
                <option value="oldest">Äldst först</option>
                <option value="most_runs">Flest körningar</option>
              </select>
            </div>

            <div className="ml-auto text-sm text-gray-600">
              {filteredAndSortedArticles.length} av {articles.length} artiklar
            </div>
          </div>
        </div>

        {articles.length === 0 ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
            <p className="text-blue-800">
              Inga artiklar än. Posta en correction med en URL via API:et för att komma igång.
            </p>
            <pre className="mt-4 text-left text-xs bg-white p-4 rounded border border-blue-200 overflow-x-auto">
{`curl -X POST http://localhost:3001/api/corrections \\
  -H "Content-Type: application/json" \\
  -d '{
    "original_article": {
      "url": "https://example.com/artikel",
      "title": "...",
      "lead": "...",
      "body": ["..."]
    },
    ...
  }'`}
            </pre>
          </div>
        ) : filteredAndSortedArticles.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-600">
              Inga artiklar matchar de valda filtren.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAndSortedArticles.map(article => (
              <div
                key={article.url}
                onClick={() => navigate(`/article/${encodeURIComponent(article.url)}`)}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-xl font-semibold text-gray-900">
                        {article.title || 'Ingen titel'}
                      </h2>
                      {article.has_gold_standard && (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          ⭐ Gold Standard
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-blue-600 mb-3 truncate">
                      {extractDomain(article.url)}
                    </div>

                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">🔄 {article.run_count}</span>
                        <span>
                          {article.run_count === 1 ? 'körning' : 'körningar'}
                        </span>
                      </div>

                      {article.latest_run_at && (
                        <div>
                          Senast: {formatDate(article.latest_run_at)}
                        </div>
                      )}

                      <div className="text-gray-400">
                        Skapad: {formatDate(article.first_seen)}
                      </div>
                    </div>
                  </div>

                  <div className="ml-4">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium">
                      Öppna →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
