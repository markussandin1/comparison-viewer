import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function ArticleDetail() {
  const navigate = useNavigate();
  const { url } = useParams();
  const decodedUrl = decodeURIComponent(url);

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchArticle();
  }, [decodedUrl]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/articles/${encodeURIComponent(decodedUrl)}`);
      if (!response.ok) throw new Error('Failed to fetch article');
      const data = await response.json();
      setArticle(data);
      setError('');
    } catch (err) {
      setError(`Error loading article: ${err.message}`);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Laddar artikel...</div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate('/')}
            className="mb-4 text-blue-600 hover:text-blue-800"
          >
            ← Tillbaka till översikt
          </button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error || 'Artikel hittades inte'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <button
          onClick={() => navigate('/')}
          className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Tillbaka till översikt
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {article.title || 'Ingen titel'}
              </h1>
              <div className="text-sm text-blue-600 break-all">
                {decodedUrl}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-600 mb-6 pb-6 border-b border-gray-200">
            <div>
              Första körning: {formatDate(article.first_seen)}
            </div>
            <div>
              Senaste uppdatering: {formatDate(article.last_updated)}
            </div>
            <div>
              Antal körningar: <span className="font-semibold">{article.runs?.length || 0}</span>
            </div>
          </div>

          {/* Runs Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">
                Correction Runs ({article.runs?.length || 0})
              </h2>
              {article.runs && article.runs.length > 1 && (
                <button
                  onClick={() => navigate(`/article/${encodeURIComponent(decodedUrl)}/compare`)}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm font-medium"
                >
                  🔍 Jämför Versioner
                </button>
              )}
            </div>

            {article.runs && article.runs.length > 0 ? (
              <div className="space-y-3">
                {article.runs.map((run) => (
                  <div
                    key={run.id}
                    onClick={() => navigate(`/correction/${run.id}`)}
                    className="border rounded-lg p-4 hover:bg-blue-50 transition-all cursor-pointer border-gray-200 hover:border-blue-400"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-semibold text-gray-900">
                            Run #{run.run_number}
                          </span>
                          {run.run_number === 1 && (
                            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                              Första
                            </span>
                          )}
                          {run.run_number === article.runs[0].run_number && run.run_number > 1 && (
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                              Senaste
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-gray-600">
                          {formatDate(run.created_at)}
                        </div>
                      </div>

                      <button className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium">
                        Visa →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Inga correction runs än.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
