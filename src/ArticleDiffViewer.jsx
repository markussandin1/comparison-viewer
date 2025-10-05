import React, { useState, useEffect, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Improved word diff algorithm using Myers algorithm approach
function computeWordDiff(original, corrected) {
  const tokenize = (text) => {
    if (!text) return [];
    return text.split(/(\s+|[.,!?;:"()–—\-\[\]{}])/).filter(token => token.length > 0);
  };

  const originalTokens = tokenize(original);
  const correctedTokens = tokenize(corrected);

  const operations = myersDiff(originalTokens, correctedTokens);
  return operations;
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

// Diff visualization component
function DiffDisplay({ operations }) {
  return (
    <div className="text-sm leading-relaxed">
      {operations.map((op, index) => {
        switch (op.type) {
          case 'equal':
            return <span key={index}>{op.text}</span>;
          case 'delete':
            return (
              <span key={index} className="bg-red-100 text-red-800 line-through px-1 rounded">
                {op.text}
              </span>
            );
          case 'insert':
            return (
              <span key={index} className="bg-green-100 text-green-800 px-1 rounded">
                {op.text}
              </span>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

// Patch-aware diff that guarantees all applied changes are shown
function computePatchAwareDiff(original, corrected, patches) {
  const tokenize = (text) => {
    if (!text) return [];
    return text.split(/(\s+|[.,!?;:"()–—\-\[\]{}])/).filter(token => token.length > 0);
  };

  if (!patches || patches.length === 0) {
    return computeWordDiff(original, corrected);
  }

  const changes = new Map();
  patches.forEach(patch => {
    const before = patch.before.trim();
    const after = patch.after.trim();
    if (before !== after) {
      changes.set(before, after);
    }
  });

  return enhanceWithPatches(original, corrected, changes);
}

function enhanceWithPatches(original, corrected, changes) {
  const tokenize = (text) => {
    if (!text) return [];
    return text.split(/(\s+|[.,!?;:"()–—\-\[\]{}])/).filter(token => token.length > 0);
  };

  const originalTokens = tokenize(original);
  const correctedTokens = tokenize(corrected);

  const operations = [];
  let originalIndex = 0;
  let correctedIndex = 0;

  while (correctedIndex < correctedTokens.length || originalIndex < originalTokens.length) {
    const correctedToken = correctedTokens[correctedIndex];
    const originalToken = originalTokens[originalIndex];

    let foundChange = false;

    for (const [before, after] of changes.entries()) {
      const beforeTokens = tokenize(before);
      const afterTokens = tokenize(after);

      if (originalIndex + beforeTokens.length <= originalTokens.length) {
        const originalSlice = originalTokens.slice(originalIndex, originalIndex + beforeTokens.length);
        if (originalSlice.join('') === beforeTokens.join('')) {
          if (correctedIndex + afterTokens.length <= correctedTokens.length) {
            const correctedSlice = correctedTokens.slice(correctedIndex, correctedIndex + afterTokens.length);
            if (correctedSlice.join('') === afterTokens.join('')) {
              beforeTokens.forEach(token => {
                operations.push({ type: 'delete', text: token });
              });
              afterTokens.forEach(token => {
                operations.push({ type: 'insert', text: token });
              });
              originalIndex += beforeTokens.length;
              correctedIndex += afterTokens.length;
              foundChange = true;
              break;
            }
          }
        }
      }

      if (!foundChange && correctedIndex + afterTokens.length <= correctedTokens.length) {
        const correctedSlice = correctedTokens.slice(correctedIndex, correctedIndex + afterTokens.length);
        if (correctedSlice.join('') === afterTokens.join('')) {
          if (originalIndex >= originalTokens.length ||
              originalTokens.slice(originalIndex, originalIndex + afterTokens.length).join('') !== afterTokens.join('')) {
            afterTokens.forEach(token => {
              operations.push({ type: 'insert', text: token });
            });
            correctedIndex += afterTokens.length;
            foundChange = true;
            break;
          }
        }
      }

      if (!foundChange && originalIndex + beforeTokens.length <= originalTokens.length) {
        const originalSlice = originalTokens.slice(originalIndex, originalIndex + beforeTokens.length);
        if (originalSlice.join('') === beforeTokens.join('')) {
          if (correctedIndex >= correctedTokens.length ||
              correctedTokens.slice(correctedIndex, correctedIndex + beforeTokens.length).join('') !== beforeTokens.join('')) {
            beforeTokens.forEach(token => {
              operations.push({ type: 'delete', text: token });
            });
            originalIndex += beforeTokens.length;
            foundChange = true;
            break;
          }
        }
      }
    }

    if (!foundChange) {
      if (originalToken === correctedToken && originalToken !== undefined) {
        operations.push({ type: 'equal', text: originalToken });
        originalIndex++;
        correctedIndex++;
      } else if (originalIndex >= originalTokens.length) {
        operations.push({ type: 'insert', text: correctedToken });
        correctedIndex++;
      } else if (correctedIndex >= correctedTokens.length) {
        operations.push({ type: 'delete', text: originalToken });
        originalIndex++;
      } else {
        operations.push({ type: 'delete', text: originalToken });
        operations.push({ type: 'insert', text: correctedToken });
        originalIndex++;
        correctedIndex++;
      }
    }
  }

  return operations;
}

// Split screen field component
function SplitScreenField({ label, original, corrected, patches = [] }) {
  const operations = useMemo(() => {
    if (!original && !corrected) return [];
    return computePatchAwareDiff(original || '', corrected || '', patches);
  }, [original, corrected, patches]);

  return (
    <div className="border-b border-gray-200 pb-4">
      <h3 className="font-semibold text-gray-700 mb-3 text-sm">{label}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 p-3 rounded border border-red-100">
          <div className="text-xs font-medium text-red-700 mb-2">Original</div>
          <div className="text-sm text-gray-800">{original}</div>
        </div>
        <div className="bg-green-50 p-3 rounded border border-green-100">
          <div className="text-xs font-medium text-green-700 mb-2">Korrigerad</div>
          <div className="text-sm text-gray-800">{corrected}</div>
        </div>
      </div>
      <div className="mt-2 p-3 bg-gray-50 rounded">
        <div className="text-xs font-medium text-gray-600 mb-2">Diff</div>
        <DiffDisplay operations={operations} />
      </div>
    </div>
  );
}

// Patches table component
function PatchesTable({ title, items, type }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-lg bg-white mt-4">
      <h3 className="font-semibold text-gray-800 p-4 border-b border-gray-200">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Agent</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Path</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Before</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">
                {type === 'applied' ? 'After' : 'Reason'}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono text-xs">{item.agent}</td>
                <td className="px-4 py-2 font-mono text-xs">{item.path}</td>
                <td className="px-4 py-2 max-w-xs truncate" title={item.before}>
                  {item.before}
                </td>
                <td className="px-4 py-2 max-w-xs truncate" title={item.after || item.reason}>
                  {item.after || item.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sidebar list component
function CorrectionsList({ corrections, selectedId, onSelect }) {
  return (
    <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Corrections</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {corrections.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">Inga corrections än</div>
        ) : (
          corrections.map(correction => (
            <div
              key={correction.id}
              onClick={() => onSelect(correction.id)}
              className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                selectedId === correction.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
              }`}
            >
              <div className="font-medium text-sm text-gray-800">
                {correction.article_id || `Correction #${correction.id}`}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(correction.created_at).toLocaleString('sv-SE')}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Main component
export default function ArticleDiffViewer() {
  const [corrections, setCorrections] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [currentCorrection, setCurrentCorrection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch all corrections on mount
  useEffect(() => {
    fetchCorrections();
  }, []);

  // Fetch selected correction details
  useEffect(() => {
    if (selectedId) {
      fetchCorrection(selectedId);
    }
  }, [selectedId]);

  const fetchCorrections = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/corrections`);
      if (!response.ok) throw new Error('Failed to fetch corrections');
      const data = await response.json();
      setCorrections(data);

      // Auto-select first correction if available
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (err) {
      setError(`Error loading corrections: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchCorrection = async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/corrections/${id}`);
      if (!response.ok) throw new Error('Failed to fetch correction');
      const data = await response.json();
      setCurrentCorrection(data);
      setError('');
    } catch (err) {
      setError(`Error loading correction: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Laddar...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <CorrectionsList
        corrections={corrections}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Correction Viewer</h1>
          <p className="text-gray-600 mb-8">
            Jämför original och korrigerade texter från AI-agenter
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {!currentCorrection && !error && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
              <p className="text-blue-800">
                {corrections.length === 0
                  ? 'Inga corrections tillgängliga. Posta en correction via API:et.'
                  : 'Välj en correction från listan till vänster'}
              </p>
            </div>
          )}

          {currentCorrection && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="mb-6 pb-4 border-b border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-800">
                      {currentCorrection.article_id || `Correction #${currentCorrection.id}`}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(currentCorrection.created_at).toLocaleString('sv-SE')}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium text-green-600">
                        {currentCorrection.applied?.length || 0}
                      </span>{' '}
                      tillämpade
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium text-red-600">
                        {currentCorrection.unapplied?.length || 0}
                      </span>{' '}
                      ej tillämpade
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {currentCorrection.original_article && currentCorrection.corrected_article && (
                  <>
                    <SplitScreenField
                      label="Titel"
                      original={currentCorrection.original_article.title}
                      corrected={currentCorrection.corrected_article.title}
                      patches={currentCorrection.applied?.filter(p => p.path === 'title') || []}
                    />

                    <SplitScreenField
                      label="Lead"
                      original={currentCorrection.original_article.lead}
                      corrected={currentCorrection.corrected_article.lead}
                      patches={currentCorrection.applied?.filter(p => p.path === 'lead') || []}
                    />

                    {currentCorrection.original_article.body?.map((paragraph, index) => {
                      const bodyPatches = currentCorrection.applied?.filter(
                        p => p.path === `body[${index}]`
                      ) || [];

                      return (
                        <SplitScreenField
                          key={index}
                          label={`Body stycke ${index + 1}`}
                          original={paragraph}
                          corrected={currentCorrection.corrected_article.body?.[index]}
                          patches={bodyPatches}
                        />
                      );
                    })}
                  </>
                )}

                <PatchesTable
                  title="Tillämpade ändringar"
                  items={currentCorrection.applied}
                  type="applied"
                />

                <PatchesTable
                  title="Ej tillämpade ändringar"
                  items={currentCorrection.unapplied}
                  type="unapplied"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
