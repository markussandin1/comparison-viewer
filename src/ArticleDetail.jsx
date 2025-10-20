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
  const [showGoldStandardForm, setShowGoldStandardForm] = useState(false);

  useEffect(() => {
    fetchArticle();
  }, [decodedUrl]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/articles/${decodedUrl}`);
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
            {article.gold_standard && (
              <span className="inline-flex items-center px-3 py-1 rounded text-sm font-medium bg-yellow-100 text-yellow-800">
                ⭐ Gold Standard
              </span>
            )}
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

          {/* Gold Standard Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Gold Standard</h2>
              {!article.gold_standard && (
                <button
                  onClick={() => setShowGoldStandardForm(!showGoldStandardForm)}
                  className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors text-sm font-medium"
                >
                  + Ladda upp Gold Standard
                </button>
              )}
            </div>

            {article.gold_standard ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="mb-2 text-sm text-gray-600">
                  Uppladdad: {formatDate(article.gold_standard_uploaded_at)}
                  {article.gold_standard_metadata?.corrector && (
                    <span className="ml-2">
                      av {article.gold_standard_metadata.corrector}
                    </span>
                  )}
                </div>
                {article.gold_standard_metadata?.notes && (
                  <div className="text-sm text-gray-600 mb-3">
                    Kommentar: {article.gold_standard_metadata.notes}
                  </div>
                )}
                <button
                  onClick={() => setShowGoldStandardForm(!showGoldStandardForm)}
                  className="text-sm text-yellow-700 hover:text-yellow-900"
                >
                  {showGoldStandardForm ? 'Dölj innehåll' : 'Visa innehåll →'}
                </button>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Ingen gold standard uppladdad än.
              </div>
            )}

            {showGoldStandardForm && (
              <GoldStandardForm
                articleUrl={decodedUrl}
                existingGoldStandard={article.gold_standard}
                onSuccess={() => {
                  setShowGoldStandardForm(false);
                  fetchArticle();
                }}
                onCancel={() => setShowGoldStandardForm(false)}
              />
            )}
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
                {article.runs.map((run) => {
                  const isRecommended = article.recommended_run_id === run.id;
                  const hasMetrics = run.metrics && article.gold_standard;

                  return (
                    <div
                      key={run.id}
                      onClick={() => navigate(`/correction/${run.id}`)}
                      className={`border rounded-lg p-4 hover:bg-blue-50 transition-all cursor-pointer ${
                        isRecommended
                          ? 'border-2 border-green-500 bg-green-50 hover:bg-green-100'
                          : 'border-gray-200 hover:border-blue-400'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-semibold text-gray-900">
                              Run #{run.run_number}
                            </span>
                            {isRecommended && (
                              <span className="text-xs px-2 py-1 bg-green-600 text-white rounded font-medium">
                                ⭐ Recommended
                              </span>
                            )}
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

                          <div className="text-sm text-gray-600 mb-3">
                            {formatDate(run.created_at)}
                          </div>

                          <div className="flex items-center gap-4 text-sm mb-2">
                            <span className="text-green-600">
                              ✓ {run.applied?.length || 0} tillämpade
                            </span>
                            <span className="text-red-600">
                              ✗ {run.unapplied?.length || 0} ej tillämpade
                            </span>
                          </div>

                          {/* Metrics display */}
                          {hasMetrics && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="flex items-center gap-6 text-sm">
                                <div>
                                  <span className="text-gray-600">vs Gold Standard:</span>
                                  <span className="ml-2 font-semibold text-blue-600">
                                    F1: {Math.round(run.metrics.overall_f1 * 100)}%
                                  </span>
                                  <span className="ml-2 text-gray-500">
                                    Similarity: {Math.round(run.metrics.overall_similarity * 100)}%
                                  </span>
                                </div>
                                {run.similarity_to_previous !== undefined && (
                                  <div className="text-gray-500">
                                    vs Previous: {Math.round(run.similarity_to_previous * 100)}%
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <button className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium">
                          Visa →
                        </button>
                      </div>
                    </div>
                  );
                })}
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

// Gold Standard Upload Form Component
function GoldStandardForm({ articleUrl, existingGoldStandard, onSuccess, onCancel }) {
  const [title, setTitle] = useState(existingGoldStandard?.title || '');
  const [lead, setLead] = useState(existingGoldStandard?.lead || '');
  const [body, setBody] = useState(existingGoldStandard?.body || '');
  const [corrector, setCorrector] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title && !lead && !body) {
      setError('Minst ett fält (titel, lead eller body) måste fyllas i');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setConflicts([]);

      const response = await fetch(
        `${API_URL}/api/articles/${encodeURIComponent(articleUrl)}/gold-standard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title,
            lead,
            body,
            metadata: {
              corrector: corrector || undefined,
              notes: notes || undefined
            }
          })
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save gold standard');
      }

      const data = await response.json();

      if (data.conflicts && data.conflicts.length > 0) {
        setConflicts(data.conflicts);
      }

      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-6">
      <h3 className="text-md font-semibold text-gray-800 mb-4">
        {existingGoldStandard ? 'Visa/Uppdatera Gold Standard' : 'Ladda upp Gold Standard'}
      </h3>

      {conflicts.length > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded p-4">
          <div className="font-medium text-yellow-800 mb-2">
            ⚠️ Varning: Innehåll skiljer sig från original
          </div>
          <div className="text-sm text-yellow-700 space-y-1">
            {conflicts.map((conflict, i) => (
              <div key={i}>
                <span className="font-medium capitalize">{conflict.field}:</span> Skillnader upptäckta
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Titel
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500"
            placeholder="Klistra in rättad titel..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lead / Ingress
          </label>
          <textarea
            value={lead}
            onChange={(e) => setLead(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500"
            placeholder="Klistra in rättad ingress..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Body / Brödtext
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500 font-mono text-sm"
            placeholder="Klistra in rättad brödtext (separera stycken med dubbla radbrytningar)..."
          />
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Metadata (valfritt)</h4>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rättad av
            </label>
            <input
              type="text"
              value={corrector}
              onChange={(e) => setCorrector(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500"
              placeholder="t.ex. Anna Svensson"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anteckningar
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500"
              placeholder="t.ex. Fokus på kommaregler"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? 'Sparar...' : 'Spara Gold Standard'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
          >
            Avbryt
          </button>
        </div>
      </form>
    </div>
  );
}
