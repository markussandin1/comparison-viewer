import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Myers diff algorithm
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

// Diff display component
function DiffText({ text, operations, mode }) {
  if (!operations) {
    return <div className="text-sm leading-relaxed whitespace-pre-wrap">{text}</div>;
  }

  if (mode === 'original') {
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
  }

  return <div className="text-sm leading-relaxed whitespace-pre-wrap">{text}</div>;
}

// Text comparison component
function TextComparison({ versions, selectedVersionIds }) {
  const selectedVersions = selectedVersionIds
    .map(id => versions.find(v => v.id === id))
    .filter(Boolean);

  if (selectedVersions.length === 0) return null;

  // Compute diff if exactly 2 versions
  let operations = null;
  if (selectedVersions.length === 2) {
    operations = computeWordDiff(
      selectedVersions[0].text || '',
      selectedVersions[1].text || ''
    );
  }

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${selectedVersions.length}, 1fr)` }}
    >
      {selectedVersions.map((version, index) => {
        let displayMode = 'plain';
        let ops = null;

        if (operations && selectedVersions.length === 2) {
          displayMode = index === 0 ? 'original' : 'modified';
          ops = operations;
        }

        return (
          <div key={version.id} className="bg-white p-4 rounded border border-gray-200 max-h-[600px] overflow-y-auto">
            <div className="text-xs font-medium mb-2 text-gray-600">
              {version.label}
              {version.isRecommended && (
                <span className="ml-2 text-green-600">⭐ Recommended</span>
              )}
            </div>
            <DiffText text={version.text} operations={ops} mode={displayMode} />
          </div>
        );
      })}
    </div>
  );
}

export default function MultiRunComparison() {
  const navigate = useNavigate();
  const { url } = useParams();
  const decodedUrl = decodeURIComponent(url);

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Column selections (array of version IDs)
  const [columns, setColumns] = useState(['original', 'gold']);

  useEffect(() => {
    fetchArticle();
  }, [decodedUrl]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/articles/${encodeURIComponent(decodedUrl)}`);
      if (!response.ok) throw new Error('Failed to fetch article');
      const data = await response.json();

      // Fetch full run details for all runs
      if (data.runs && data.runs.length > 0) {
        const runDetailsPromises = data.runs.map(run =>
          fetch(`${API_URL}/api/runs/${run.id}`).then(res => res.json())
        );
        const fullRuns = await Promise.all(runDetailsPromises);
        data.runs = fullRuns;
      }

      setArticle(data);

      // Set smart defaults
      if (data.gold_standard && data.runs && data.runs.length > 0) {
        setColumns(['gold', `run-${data.runs[0].id}`]);
      } else if (data.gold_standard) {
        setColumns(['original', 'gold']);
      } else if (data.runs && data.runs.length > 0) {
        setColumns(['original', `run-${data.runs[0].id}`]);
      }

      setError('');
    } catch (err) {
      setError(`Error loading article: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Build available versions list
  const availableVersions = useMemo(() => {
    if (!article) return [];

    const versions = [];

    // Original
    versions.push({
      id: 'original',
      label: 'Original',
      text: article.original_article || ''
    });

    // Gold Standard
    if (article.gold_standard) {
      versions.push({
        id: 'gold',
        label: 'Gold Standard',
        text: article.gold_standard
      });
    }

    // Runs
    if (article.runs) {
      article.runs.forEach(run => {
        versions.push({
          id: `run-${run.id}`,
          label: `Run #${run.run_number}`,
          text: run.corrected_article || '',
          isRecommended: run.id === article.recommended_run_id,
          metrics: run.metrics
        });
      });
    }

    return versions;
  }, [article]);

  const addColumn = () => {
    if (columns.length < 4) {
      const available = availableVersions.find(v => !columns.includes(v.id));
      if (available) {
        setColumns([...columns, available.id]);
      }
    }
  };

  const removeColumn = (index) => {
    if (columns.length > 1) {
      setColumns(columns.filter((_, i) => i !== index));
    }
  };

  const updateColumn = (index, versionId) => {
    const newColumns = [...columns];
    newColumns[index] = versionId;
    setColumns(newColumns);
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
          <button onClick={() => navigate(-1)} className="mb-4 text-blue-600 hover:text-blue-800">
            ← Tillbaka
          </button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error || 'Artikel hittades inte'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Extract title from first line
  const title = article.original_article?.split('\n')[0] || article.title;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <button
          onClick={() => navigate(`/article/${encodeURIComponent(decodedUrl)}`)}
          className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Tillbaka till artikel
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Jämför Versioner
          </h1>
          <div className="text-sm text-gray-600 mb-6">
            {title || decodedUrl}
          </div>

          {/* Column Selectors */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-700">
                Välj versioner att jämföra:
              </div>
              <div className="flex items-center gap-2">
                {columns.length < 4 && availableVersions.length > columns.length && (
                  <button
                    onClick={addColumn}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    + Lägg till kolumn
                  </button>
                )}
                <div className="text-xs text-gray-500">
                  {columns.length === 2 ? 'Visar diff' : `${columns.length} kolumner`}
                </div>
              </div>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
              {columns.map((selectedId, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={selectedId}
                    onChange={(e) => updateColumn(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableVersions.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                        {v.isRecommended ? ' ⭐' : ''}
                        {v.metrics ? ` (F1: ${Math.round(v.metrics.overall_f1 * 100)}%)` : ''}
                      </option>
                    ))}
                  </select>
                  {columns.length > 1 && (
                    <button
                      onClick={() => removeColumn(index)}
                      className="px-2 py-2 text-gray-400 hover:text-red-600 transition-colors"
                      title="Ta bort kolumn"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Text Comparison */}
          <TextComparison
            versions={availableVersions}
            selectedVersionIds={columns}
          />

          {/* Metrics Summary */}
          {columns.includes('gold') && article.runs && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-4">Metrics Summary</h3>
              <div className="grid grid-cols-3 gap-4">
                {article.runs
                  .filter(run => columns.includes(`run-${run.id}`) && run.metrics)
                  .map(run => (
                    <div key={run.id} className="bg-blue-50 border border-blue-200 rounded p-4">
                      <div className="text-sm font-medium text-blue-900 mb-2">
                        Run #{run.run_number}
                        {run.id === article.recommended_run_id && ' ⭐'}
                      </div>
                      <div className="text-xs text-blue-700 space-y-1">
                        <div>F1 Score: <span className="font-bold">{Math.round(run.metrics.overall_f1 * 100)}%</span></div>
                        <div>Similarity: {Math.round(run.metrics.overall_similarity * 100)}%</div>
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
