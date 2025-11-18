import React, { useState, useMemo } from 'react';

/**
 * MergedChangesViewer - Component for displaying v2 schema corrections
 * Shows individual changes with metadata and highlights exact character positions
 */

// Helper function to apply highlights to text based on character positions
function highlightText(text, changes) {
  if (!text || !changes || changes.length === 0) {
    return <span>{text}</span>;
  }

  // Sort changes by position
  const sortedChanges = [...changes].sort((a, b) => a.char_start - b.char_start);

  const segments = [];
  let lastIndex = 0;

  sortedChanges.forEach((change, idx) => {
    const { char_start, char_end, status, severity } = change;

    // Add text before this change
    if (char_start > lastIndex) {
      segments.push({
        type: 'normal',
        text: text.substring(lastIndex, char_start),
        key: `normal-${idx}`
      });
    }

    // Add highlighted change
    segments.push({
      type: 'change',
      text: text.substring(char_start, char_end),
      status,
      severity,
      change,
      key: `change-${idx}`
    });

    lastIndex = char_end;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'normal',
      text: text.substring(lastIndex),
      key: `normal-end`
    });
  }

  return (
    <span>
      {segments.map(segment => {
        if (segment.type === 'normal') {
          return <span key={segment.key}>{segment.text}</span>;
        }

        // Highlight changed text
        const bgColor = segment.severity === 'major'
          ? 'bg-red-100 border-b-2 border-red-400'
          : 'bg-yellow-100 border-b-2 border-yellow-400';

        const statusBadge = segment.status === 'multi_agent_agreement'
          ? 'font-semibold'
          : '';

        return (
          <span
            key={segment.key}
            className={`${bgColor} ${statusBadge} px-0.5 rounded cursor-help`}
            title={`${segment.change.original_text} → ${segment.change.suggested_text}`}
          >
            {segment.text}
          </span>
        );
      })}
    </span>
  );
}

// Component to display a single change
function ChangeItem({ change, index }) {
  const [expanded, setExpanded] = useState(false);

  const severityColors = {
    major: 'bg-red-50 border-red-200',
    minor: 'bg-yellow-50 border-yellow-200'
  };

  const statusBadges = {
    multi_agent_agreement: { text: 'Flera agenter', color: 'bg-green-100 text-green-800' },
    single_source: { text: 'En agent', color: 'bg-blue-100 text-blue-800' }
  };

  const statusBadge = statusBadges[change.status] || statusBadges.single_source;
  const severityColor = severityColors[change.severity] || severityColors.minor;

  return (
    <div className={`border rounded-lg p-4 ${severityColor} hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs text-gray-500">#{index + 1}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge.color}`}>
              {statusBadge.text}
            </span>
            {change.severity && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                change.severity === 'major' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'
              }`}>
                {change.severity}
              </span>
            )}
            {change.confidence > 0 && (
              <span className="text-xs text-gray-600">
                Confidence: {(change.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>

          {/* Change details */}
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-red-600 line-through font-mono">
                {change.original_text}
              </span>
              <span className="text-gray-400">→</span>
              <span className="text-sm text-green-600 font-mono">
                {change.suggested_text}
              </span>
            </div>

            {/* Section info */}
            {change.section_id && (
              <div className="text-xs text-gray-500">
                Position: {change.section_id} (char {change.char_start}-{change.char_end})
              </div>
            )}
          </div>

          {/* Explanations */}
          {change.explanations && change.explanations.length > 0 && (
            <div className="mt-2">
              <div className="text-sm text-gray-700">
                <span className="font-medium">Förklaring: </span>
                {change.explanations[0]}
              </div>
            </div>
          )}

          {/* Agents */}
          {change.agent_ids && change.agent_ids.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-600">Agenter:</span>
              {change.agent_ids.map((agent, idx) => (
                <span
                  key={idx}
                  className={`px-2 py-0.5 rounded text-xs ${
                    agent === change.primary_agent_id
                      ? 'bg-blue-200 text-blue-800 font-medium'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {agent}
                </span>
              ))}
            </div>
          )}

          {/* Categories */}
          {change.categories && change.categories.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-600">Kategorier:</span>
              {change.categories.map((cat, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}

          {/* Expandable details */}
          {change.explanations && change.explanations.length > 1 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800"
            >
              {expanded ? '▼ Dölj detaljer' : '▶ Visa alla förklaringar'}
            </button>
          )}

          {expanded && change.explanations && (
            <div className="mt-2 space-y-1 pl-4 border-l-2 border-gray-300">
              {change.explanations.slice(1).map((exp, idx) => (
                <div key={idx} className="text-sm text-gray-600">
                  • {exp}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main component
export default function MergedChangesViewer({ correction }) {
  const { merged_changes, original_article } = correction;

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [showHighlights, setShowHighlights] = useState(true);

  // Get statistics
  const stats = useMemo(() => {
    if (!merged_changes) return null;

    const total = merged_changes.length;
    const multiAgent = merged_changes.filter(c => c.status === 'multi_agent_agreement').length;
    const singleAgent = total - multiAgent;
    const major = merged_changes.filter(c => c.severity === 'major').length;
    const minor = merged_changes.filter(c => c.severity === 'minor').length;

    // Group by category
    const byCategory = {};
    merged_changes.forEach(change => {
      if (change.categories) {
        change.categories.forEach(cat => {
          byCategory[cat] = (byCategory[cat] || 0) + 1;
        });
      }
    });

    return { total, multiAgent, singleAgent, major, minor, byCategory };
  }, [merged_changes]);

  // Filter changes
  const filteredChanges = useMemo(() => {
    if (!merged_changes) return [];

    return merged_changes.filter(change => {
      if (filterStatus !== 'all' && change.status !== filterStatus) return false;
      if (filterSeverity !== 'all' && change.severity !== filterSeverity) return false;
      return true;
    });
  }, [merged_changes, filterStatus, filterSeverity]);

  if (!merged_changes || merged_changes.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
        Inga ändringar att visa
      </div>
    );
  }

  const originalText = typeof original_article === 'string'
    ? original_article
    : (original_article?.body || '');

  // Generate corrected text by applying changes
  const correctedText = useMemo(() => {
    if (!merged_changes || merged_changes.length === 0) {
      return originalText;
    }

    // Sort changes by position (descending) to apply from end to start
    const sortedChanges = [...merged_changes].sort((a, b) => b.char_start - a.char_start);

    let result = originalText;

    for (const change of sortedChanges) {
      if (change.operation === 'replace') {
        const before = result.substring(0, change.char_start);
        const after = result.substring(change.char_end);
        result = before + change.suggested_text + after;
      } else if (change.operation === 'insert') {
        const before = result.substring(0, change.char_start);
        const after = result.substring(change.char_start);
        result = before + change.suggested_text + after;
      } else if (change.operation === 'delete') {
        const before = result.substring(0, change.char_start);
        const after = result.substring(change.char_end);
        result = before + after;
      }
    }

    return result;
  }, [originalText, merged_changes]);

  return (
    <div className="space-y-6">
      {/* Statistics */}
      {stats && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold mb-3">Statistik</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-xs text-gray-600">Totalt ändringar</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.multiAgent}</div>
              <div className="text-xs text-gray-600">Flera agenter eniga</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.major}</div>
              <div className="text-xs text-gray-600">Major</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.minor}</div>
              <div className="text-xs text-gray-600">Minor</div>
            </div>
          </div>

          {/* Category breakdown */}
          {Object.keys(stats.byCategory).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="text-sm font-medium mb-2">Per kategori:</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.byCategory).map(([cat, count]) => (
                  <span key={cat} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                    {cat}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="text-sm font-medium text-gray-700 mr-2">Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1 text-sm"
            >
              <option value="all">Alla</option>
              <option value="multi_agent_agreement">Flera agenter</option>
              <option value="single_source">En agent</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mr-2">Severity:</label>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1 text-sm"
            >
              <option value="all">Alla</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="showHighlights"
              checked={showHighlights}
              onChange={(e) => setShowHighlights(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="showHighlights" className="text-sm font-medium text-gray-700">
              Visa highlights i text
            </label>
          </div>
        </div>
      </div>

      {/* Side-by-side comparison */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Text jämförelse</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Original */}
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <div className="bg-red-50 border-b border-red-200 px-4 py-2">
              <h4 className="font-semibold text-red-900 text-sm">Original</h4>
            </div>
            <div className="p-4 bg-white max-h-96 overflow-y-auto">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                {showHighlights ? highlightText(originalText, filteredChanges) : originalText}
              </div>
            </div>
          </div>

          {/* Corrected */}
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <div className="bg-green-50 border-b border-green-200 px-4 py-2">
              <h4 className="font-semibold text-green-900 text-sm">Korrigerad</h4>
            </div>
            <div className="p-4 bg-white max-h-96 overflow-y-auto">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                {correctedText}
              </div>
            </div>
          </div>
        </div>

        {showHighlights && (
          <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-red-100 border-b-2 border-red-400 rounded"></span>
                <span>Major severity (i original)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-yellow-100 border-b-2 border-yellow-400 rounded"></span>
                <span>Minor severity (i original)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Fetstil</span>
                <span>= Flera agenter eniga</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Changes list */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">
          Ändringar ({filteredChanges.length})
        </h3>
        {filteredChanges.map((change, idx) => (
          <ChangeItem key={change.id || idx} change={change} index={idx} />
        ))}
      </div>
    </div>
  );
}
