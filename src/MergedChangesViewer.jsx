import React, { useState, useMemo } from 'react';

/**
 * MergedChangesViewer - Component for displaying v2 schema corrections
 * Shows original and corrected text directly from JSON data
 */

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
  const { merged_changes, original_article, corrected_article } = correction;

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');

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

  // Helper to get text from article object
  const getArticleText = (article) => {
    if (!article) return '';
    if (typeof article === 'string') return article;

    // Combine title, lead, and body if present
    const parts = [];
    if (article.title) parts.push(article.title);
    if (article.lead) parts.push(article.lead);
    if (article.body) {
      const bodyText = Array.isArray(article.body)
        ? article.body.join('\n\n')
        : article.body;
      parts.push(bodyText);
    }
    return parts.join('\n\n');
  };

  // Use data directly from JSON - no transformations
  const originalText = getArticleText(original_article);
  const correctedText = getArticleText(corrected_article);

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
                {originalText}
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
