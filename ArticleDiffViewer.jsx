/*
 * Article Diff Viewer - MVP
 *
 * A React component for comparing original articles against merge outputs with visual diffs.
 *
 * Usage:
 * - Import and use as a React component
 * - Requires Tailwind CSS for styling
 * - Self-contained with demo data
 *
 * Features:
 * - Word-level diff visualization for title, lead, and body sections
 * - Applied/unapplied patches tables
 * - JSON input validation and error handling
 * - Reset to demo functionality
 */

import React, { useState, useMemo } from 'react';

// Demo data
const demoOriginal = {
  "article_id": "demo_001",
  "title": "AI Revolution Transforms Healthcare Industry",
  "lead": "Artificial intelligence is rapidly changing how doctors diagnose and treat patients worldwide.",
  "body": [
    "Machine learning algorithms are now being used to analyze medical images with unprecedented accuracy.",
    "Hospitals report significant improvements in patient outcomes since implementing AI systems."
  ],
  "captions": ["AI scanning patient data"]
};

const demoMergeOutput = {
  "article_id": "demo_001",
  "corrected_article": {
    "title": "AI Revolution Transforms Healthcare Industry Globally",
    "lead": "Artificial intelligence is rapidly transforming how doctors diagnose and treat patients worldwide.",
    "body": [
      "Advanced machine learning algorithms are now being used to analyze medical images with unprecedented accuracy.",
      "Hospitals report significant improvements in patient outcomes since implementing AI diagnostic systems."
    ],
    "captions": ["AI scanning patient data"]
  },
  "applied": [
    { "agent": "grammar", "path": "title", "before": "AI Revolution Transforms Healthcare Industry", "after": "AI Revolution Transforms Healthcare Industry Globally" },
    { "agent": "grammar", "path": "lead", "before": "changing", "after": "transforming" },
    { "agent": "style", "path": "body[0]", "before": "Machine learning", "after": "Advanced machine learning" },
    { "agent": "clarity", "path": "body[1]", "before": "AI systems", "after": "AI diagnostic systems" }
  ],
  "unapplied": [
    { "agent": "fact_check", "path": "lead", "reason": "Could not verify global claim", "before": "worldwide", "after": "in major cities" }
  ]
};

// Improved word diff algorithm using Myers algorithm approach
function computeWordDiff(original, corrected) {
  const tokenize = (text) => {
    if (!text) return [];
    // Split on word boundaries while preserving spaces and punctuation
    return text.split(/(\s+|[.,!?;:"()–—\-\[\]{}])/).filter(token => token.length > 0);
  };

  const originalTokens = tokenize(original);
  const correctedTokens = tokenize(corrected);

  // Use a more precise algorithm - Myers diff algorithm simplified
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

// Field diff component with patch-aware highlighting
function FieldDiff({ label, original, corrected, patches = [] }) {
  const operations = useMemo(() => {
    if (!original && !corrected) return [];
    return computePatchAwareDiff(original || '', corrected || '', patches);
  }, [original, corrected, patches]);

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <h3 className="font-semibold text-gray-800 mb-3">{label}</h3>
      <DiffDisplay operations={operations} />
    </div>
  );
}

// Patch-aware diff that guarantees all applied changes are shown
function computePatchAwareDiff(original, corrected, patches) {
  // Start with the base diff
  const baseOps = computeWordDiff(original, corrected);

  // If no patches, return base diff
  if (!patches || patches.length === 0) {
    return baseOps;
  }

  // Build a map of all changes from patches
  const changes = new Map();
  patches.forEach(patch => {
    const before = patch.before.trim();
    const after = patch.after.trim();
    if (before !== after) {
      changes.set(before, after);
    }
  });

  // Apply patch-based highlighting
  return enhanceWithPatches(original, corrected, changes);
}

function enhanceWithPatches(original, corrected, changes) {
  // Tokenize both texts
  const tokenize = (text) => {
    if (!text) return [];
    return text.split(/(\s+|[.,!?;:"()–—\-\[\]{}])/).filter(token => token.length > 0);
  };

  const originalTokens = tokenize(original);
  const correctedTokens = tokenize(corrected);

  // Build operations by going through the corrected text and finding what changed
  const operations = [];
  let originalIndex = 0;
  let correctedIndex = 0;

  while (correctedIndex < correctedTokens.length || originalIndex < originalTokens.length) {
    const correctedToken = correctedTokens[correctedIndex];
    const originalToken = originalTokens[originalIndex];

    // Check if current token(s) represent a known change
    let foundChange = false;

    // Look for multi-word changes
    for (const [before, after] of changes.entries()) {
      const beforeTokens = tokenize(before);
      const afterTokens = tokenize(after);

      // Check if we're at the start of a 'before' sequence in original
      if (originalIndex + beforeTokens.length <= originalTokens.length) {
        const originalSlice = originalTokens.slice(originalIndex, originalIndex + beforeTokens.length);
        if (originalSlice.join('') === beforeTokens.join('')) {
          // Check if we're at the start of an 'after' sequence in corrected
          if (correctedIndex + afterTokens.length <= correctedTokens.length) {
            const correctedSlice = correctedTokens.slice(correctedIndex, correctedIndex + afterTokens.length);
            if (correctedSlice.join('') === afterTokens.join('')) {
              // Found a change!
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

      // Check if we're at the start of an 'after' sequence (insertion only)
      if (!foundChange && correctedIndex + afterTokens.length <= correctedTokens.length) {
        const correctedSlice = correctedTokens.slice(correctedIndex, correctedIndex + afterTokens.length);
        if (correctedSlice.join('') === afterTokens.join('')) {
          // Check if this after doesn't exist in original at current position
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

      // Check if we're at the start of a 'before' sequence (deletion only)
      if (!foundChange && originalIndex + beforeTokens.length <= originalTokens.length) {
        const originalSlice = originalTokens.slice(originalIndex, originalIndex + beforeTokens.length);
        if (originalSlice.join('') === beforeTokens.join('')) {
          // Check if this before doesn't exist in corrected at current position
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
      // No patch change found, check if tokens match
      if (originalToken === correctedToken && originalToken !== undefined) {
        operations.push({ type: 'equal', text: originalToken });
        originalIndex++;
        correctedIndex++;
      } else if (originalIndex >= originalTokens.length) {
        // Rest are insertions
        operations.push({ type: 'insert', text: correctedToken });
        correctedIndex++;
      } else if (correctedIndex >= correctedTokens.length) {
        // Rest are deletions
        operations.push({ type: 'delete', text: originalToken });
        originalIndex++;
      } else {
        // Tokens don't match, fall back to basic diff logic
        operations.push({ type: 'delete', text: originalToken });
        operations.push({ type: 'insert', text: correctedToken });
        originalIndex++;
        correctedIndex++;
      }
    }
  }

  return operations;
}

// Patches table component
function PatchesTable({ title, items, type }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
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

// Legend component
function Legend() {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <h3 className="font-semibold text-gray-800 mb-3">Legend</h3>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Added</span>
          <span className="text-gray-600">New content</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-red-100 text-red-800 line-through px-2 py-1 rounded text-xs">Removed</span>
          <span className="text-gray-600">Deleted content</span>
        </div>
      </div>
    </div>
  );
}

// Main component
export default function ArticleDiffViewer() {
  const [originalInput, setOriginalInput] = useState(JSON.stringify(demoOriginal, null, 2));
  const [mergeInput, setMergeInput] = useState(JSON.stringify(demoMergeOutput, null, 2));
  const [selectedBodyIndex, setSelectedBodyIndex] = useState(0);
  const [error, setError] = useState('');

  // Parse JSON inputs
  const { originalArticle, mergeOutput } = useMemo(() => {
    try {
      const original = JSON.parse(originalInput);
      const merge = JSON.parse(mergeInput);

      // Normalize original article format
      let normalizedOriginal = original;
      if (original && !original.article_id) {
        // Handle simple format: {title, lead, body}
        normalizedOriginal = {
          article_id: "user_input",
          title: original.title || "",
          lead: original.lead || "",
          body: Array.isArray(original.body) ? original.body : (original.body ? [original.body] : []),
          captions: original.captions || []
        };
      }

      setError('');
      return { originalArticle: normalizedOriginal, mergeOutput: merge };
    } catch (err) {
      setError(`JSON Parse Error: ${err.message}`);
      return { originalArticle: null, mergeOutput: null };
    }
  }, [originalInput, mergeInput]);

  const resetDemo = () => {
    setOriginalInput(JSON.stringify(demoOriginal, null, 2));
    setMergeInput(JSON.stringify(demoMergeOutput, null, 2));
    setSelectedBodyIndex(0);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Article Diff Viewer</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Column */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Original Article JSON</h2>
              <textarea
                value={originalInput}
                onChange={(e) => setOriginalInput(e.target.value)}
                className="w-full h-64 p-3 border border-gray-300 rounded-lg font-mono text-xs resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Paste original article JSON here..."
              />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Merge Output JSON</h2>
              <textarea
                value={mergeInput}
                onChange={(e) => setMergeInput(e.target.value)}
                className="w-full h-64 p-3 border border-gray-300 rounded-lg font-mono text-xs resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Paste merge output JSON here..."
              />
            </div>

            <button
              onClick={resetDemo}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Reset Demo
            </button>
          </div>

          {/* Results Column */}
          <div className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {originalArticle && (
              <>
                <Legend />

                {mergeOutput && mergeOutput.corrected_article ? (
                  // Full diff mode with merge output
                  <>
                    <FieldDiff
                      label="Title"
                      original={originalArticle.title}
                      corrected={mergeOutput.corrected_article.title}
                      patches={mergeOutput.applied?.filter(patch => patch.path === 'title') || []}
                    />

                    <FieldDiff
                      label="Lead"
                      original={originalArticle.lead}
                      corrected={mergeOutput.corrected_article.lead}
                      patches={mergeOutput.applied?.filter(patch => patch.path === 'lead') || []}
                    />

                    {originalArticle.body && originalArticle.body.length > 0 && (
                      <div className="border border-gray-200 rounded-lg p-4 bg-white">
                        <h3 className="font-semibold text-gray-800 mb-3">Body</h3>
                        <div className="space-y-4">
                          {originalArticle.body.map((paragraph, index) => {
                            const bodyPatches = mergeOutput.applied?.filter(patch =>
                              patch.path === `body[${index}]`
                            ) || [];

                            return (
                              <div key={index}>
                                <DiffDisplay
                                  operations={computePatchAwareDiff(
                                    paragraph || '',
                                    mergeOutput.corrected_article.body?.[index] || '',
                                    bodyPatches
                                  )}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <PatchesTable
                      title="Applied Patches"
                      items={mergeOutput.applied}
                      type="applied"
                    />

                    <PatchesTable
                      title="Unapplied Patches"
                      items={mergeOutput.unapplied}
                      type="unapplied"
                    />
                  </>
                ) : (
                  // Display mode - just show the original article
                  <div className="border border-gray-200 rounded-lg p-4 bg-white">
                    <h3 className="font-semibold text-gray-800 mb-4">Original Article</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2">Title:</h4>
                        <p className="text-sm">{originalArticle.title}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2">Lead:</h4>
                        <p className="text-sm">{originalArticle.lead}</p>
                      </div>
                      {originalArticle.body && originalArticle.body.length > 0 && (
                        <div>
                          <h4 className="font-medium text-gray-700 mb-2">Body:</h4>
                          <div className="space-y-2">
                            {originalArticle.body.map((paragraph, index) => (
                              <p key={index} className="text-sm">{paragraph}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 p-3 bg-blue-50 rounded">
                      <p className="text-blue-800 text-sm">
                        Paste a MergeOutputV1 JSON in the second textarea to see diff comparison.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}