import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Myers diff algorithm (reused from original)
function computeWordDiff(text1, text2) {
  const tokenize = (text) => {
    if (!text) return [];
    return text.split(/(\s+|[.,!?;:"()–—\-\[\]{}])/).filter(token => token.length > 0);
  };

  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  return myersDiff(tokens1, tokens2);
}

function myersDiff(a, b) {
  const N = a.length;
  const M = b.length;
  const MAX = N + M;
  const v = {};
  const trace = [];

  v[1] = 0;

  for (let d = 0; d <= MAX; d++) {
    trace.push({ ...v });

    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[k - 1] < v[k + 1])) {
        x = v[k + 1];
      } else {
        x = v[k - 1] + 1;
      }

      let y = x - k;

      while (x < N && y < M && a[x] === b[y]) {
        x++;
        y++;
      }

      v[k] = x;

      if (x >= N && y >= M) {
        return buildPath(a, b, trace, d);
      }
    }
  }

  return [];
}

function buildPath(a, b, trace, d) {
  const operations = [];
  let x = a.length;
  let y = b.length;

  for (let D = d; D >= 0; D--) {
    const v = trace[D];
    const k = x - y;

    let prevK;
    if (k === -D || (k !== D && v[k - 1] < v[k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v[prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      operations.unshift({ type: 'equal', text: a[x - 1] });
      x--;
      y--;
    }

    if (D > 0) {
      if (x > prevX) {
        operations.unshift({ type: 'delete', text: a[x - 1] });
        x--;
      } else {
        operations.unshift({ type: 'insert', text: b[y - 1] });
        y--;
      }
    }
  }

  return operations;
}

// Flexible diff display component - shows based on comparison mode
function FlexibleDiffDisplay({ text, operations, mode }) {
  if (mode === 'original') {
    // Show deletions
    return (
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
        {operations.map((op, index) => {
          if (op.type === 'equal' || op.type === 'delete') {
            return (
              <span
                key={index}
                className={op.type === 'delete' ? 'bg-red-100 text-red-800 line-through' : ''}
              >
                {op.text}
              </span>
            );
          }
          return null;
        })}
      </div>
    );
  } else if (mode === 'modified') {
    // Show insertions
    return (
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
        {operations.map((op, index) => {
          if (op.type === 'equal' || op.type === 'insert') {
            return (
              <span
                key={index}
                className={op.type === 'insert' ? 'bg-green-100 text-green-800' : ''}
              >
                {op.text}
              </span>
            );
          }
          return null;
        })}
      </div>
    );
  } else {
    // Plain text (for gold standard or plain view)
    return <div className="text-sm leading-relaxed whitespace-pre-wrap">{text}</div>;
  }
}

// Single field comparison component
function FieldComparison({ label, versions, selectedVersions }) {
  const visibleVersions = selectedVersions.filter(v => versions[v.key]);

  if (visibleVersions.length === 0) return null;

  // Compute diff operations if we have exactly 2 versions selected
  let operations = null;
  if (visibleVersions.length === 2) {
    const [first, second] = visibleVersions;
    operations = computeWordDiff(versions[first.key] || '', versions[second.key] || '');
  }

  return (
    <div className="border-b border-gray-200 pb-6 mb-6">
      <h3 className="font-semibold text-gray-700 mb-3 text-sm">{label}</h3>
      <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${visibleVersions.length}, 1fr)` }}>
        {visibleVersions.map((version, index) => {
          const text = versions[version.key] || '';
          let displayMode = 'plain';
          let ops = null;

          if (operations && visibleVersions.length === 2) {
            if (index === 0) {
              displayMode = 'original';
              ops = operations;
            } else {
              displayMode = 'modified';
              ops = operations;
            }
          }

          return (
            <div key={version.key} className="bg-white p-4 rounded border border-gray-200">
              <div className={`text-xs font-medium mb-2 ${version.color}`}>
                {version.label}
              </div>
              {ops ? (
                <FlexibleDiffDisplay text={text} operations={ops} mode={displayMode} />
              ) : (
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{text}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CorrectionViewer() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [correction, setCorrection] = useState(null);
  const [goldStandard, setGoldStandard] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Comparison selection
  const [showOriginal, setShowOriginal] = useState(true);
  const [showCorrected, setShowCorrected] = useState(true);
  const [showGold, setShowGold] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCorrection(parseInt(id));
    }
  }, [id]);

  const fetchCorrection = async (correctionId) => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`${API_URL}/api/corrections/${correctionId}`);
      if (!response.ok) throw new Error('Failed to fetch correction');
      const data = await response.json();
      setCorrection(data);

      // Try to fetch gold standard and metrics if article URL exists
      if (data.original_article?.url) {
        const articleUrl = data.original_article.url;
        const articleResponse = await fetch(
          `${API_URL}/api/articles/${encodeURIComponent(articleUrl)}`
        );

        if (articleResponse.ok) {
          const articleData = await articleResponse.json();
          if (articleData.gold_standard) {
            setGoldStandard(articleData.gold_standard);
            setShowGold(true);

            // Find metrics for this specific run
            const run = articleData.runs?.find(r => r.id === correctionId);
            if (run?.metrics) {
              setMetrics(run.metrics);
            }
          }
        }
      }
    } catch (err) {
      setError(`Error loading correction: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const selectedVersions = useMemo(() => {
    const versions = [];
    if (showOriginal) {
      versions.push({ key: 'original', label: 'Original', color: 'text-gray-600' });
    }
    if (showCorrected) {
      versions.push({ key: 'corrected', label: 'Korrigerad', color: 'text-blue-600' });
    }
    if (showGold && goldStandard) {
      versions.push({ key: 'gold', label: 'Gold Standard', color: 'text-yellow-600' });
    }
    return versions;
  }, [showOriginal, showCorrected, showGold, goldStandard]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Laddar correction...</div>
      </div>
    );
  }

  if (error || !correction) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 text-blue-600 hover:text-blue-800"
          >
            ← Tillbaka
          </button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error || 'Correction hittades inte'}</p>
          </div>
        </div>
      </div>
    );
  }

  const originalArticle = correction.original_article || {};
  const correctedArticle = correction.corrected_article || {};

  // Helper to combine lead + body
  const combineLeadAndBody = (article) => {
    const lead = article.lead || '';
    const body = Array.isArray(article.body)
      ? article.body.join('\n\n')
      : (article.body || '');

    // If both lead and body exist, combine them with double newline
    if (lead && body) {
      return `${lead}\n\n${body}`;
    }
    return lead || body;
  };

  // Prepare body text (including lead if present)
  const originalBody = combineLeadAndBody(originalArticle);
  const correctedBody = combineLeadAndBody(correctedArticle);
  const goldBody = goldStandard ? combineLeadAndBody(goldStandard) : '';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Tillbaka
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {originalArticle.title || 'Correction Detail'}
          </h1>
          {originalArticle.url && (
            <div className="text-sm text-blue-600 mb-4">
              {originalArticle.url}
            </div>
          )}

          {/* Version Selection */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <div className="text-sm font-medium text-gray-700 mb-3">
              Välj versioner att jämföra:
            </div>
            <div className="flex items-center gap-6 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOriginal}
                  onChange={(e) => setShowOriginal(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Original</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCorrected}
                  onChange={(e) => setShowCorrected(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Korrigerad</span>
              </label>

              {goldStandard && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGold}
                    onChange={(e) => setShowGold(e.target.checked)}
                    className="w-4 h-4 text-yellow-600 rounded focus:ring-2 focus:ring-yellow-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    ⭐ Gold Standard
                  </span>
                </label>
              )}

              <div className="ml-auto text-xs text-gray-500">
                {selectedVersions.length === 2
                  ? 'Visar diff mellan valda versioner'
                  : selectedVersions.length === 1
                  ? 'Välj en till för diff'
                  : selectedVersions.length === 0
                  ? 'Välj minst en version'
                  : 'Visar text (välj exakt 2 för diff)'}
              </div>
            </div>
          </div>

          {/* Metrics Display */}
          {metrics && showGold && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="text-sm font-semibold text-blue-900 mb-3">
                Metrics vs Gold Standard
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-blue-700 font-medium">Overall F1 Score</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {Math.round(metrics.overall_f1 * 100)}%
                  </div>
                </div>
                <div>
                  <div className="text-blue-700 font-medium">Similarity</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {Math.round(metrics.overall_similarity * 100)}%
                  </div>
                </div>
                <div>
                  <div className="text-blue-700 font-medium">Precision / Recall</div>
                  <div className="text-lg font-semibold text-blue-900">
                    {Math.round((metrics.title?.precision || 0) * 100)}% / {Math.round((metrics.title?.recall || 0) * 100)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Content Comparison */}
          {selectedVersions.length > 0 ? (
            <div className="space-y-6">
              <FieldComparison
                label="Titel"
                versions={{
                  original: originalArticle.title,
                  corrected: correctedArticle.title,
                  gold: goldStandard?.title
                }}
                selectedVersions={selectedVersions}
              />

              <FieldComparison
                label="Lead"
                versions={{
                  original: originalArticle.lead,
                  corrected: correctedArticle.lead,
                  gold: goldStandard?.lead
                }}
                selectedVersions={selectedVersions}
              />

              <FieldComparison
                label="Body"
                versions={{
                  original: originalBody,
                  corrected: correctedBody,
                  gold: goldBody
                }}
                selectedVersions={selectedVersions}
              />
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Välj minst en version att visa
            </div>
          )}

          {/* Applied/Unapplied Changes */}
          {correction.applied && correction.applied.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-3">
                Tillämpade ändringar ({correction.applied.length})
              </h3>
              <div className="space-y-2 text-sm">
                {correction.applied.map((change, i) => (
                  <div key={i} className="bg-green-50 border border-green-200 rounded p-3">
                    <div className="font-medium text-green-900">
                      {change.agent} - {change.path}
                    </div>
                    <div className="text-green-700 mt-1">
                      <span className="line-through">{change.before}</span>
                      {' → '}
                      <span className="font-medium">{change.after}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {correction.unapplied && correction.unapplied.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-gray-800 mb-3">
                Ej tillämpade ändringar ({correction.unapplied.length})
              </h3>
              <div className="space-y-2 text-sm">
                {correction.unapplied.map((change, i) => (
                  <div key={i} className="bg-red-50 border border-red-200 rounded p-3">
                    <div className="font-medium text-red-900">
                      {change.agent} - {change.path}
                    </div>
                    <div className="text-red-700 mt-1">
                      Reason: {change.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
