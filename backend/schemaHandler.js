/**
 * Schema Handler
 *
 * Handles detection and normalization of different correction schemas:
 * - v1: original_article (object), corrected_article (object), applied, unapplied
 * - v2: original_article (string), merged_changes (array)
 */

/**
 * Detect which schema version the incoming data uses
 * @param {Object} data - The incoming data object
 * @returns {string} - 'v1' or 'v2'
 */
function detectSchema(data) {
  // Check for v2 schema markers
  if (data.merged_changes && Array.isArray(data.merged_changes)) {
    return 'v2';
  }

  // Check for v1 schema markers
  if (data.corrected_article || data.original_article) {
    return 'v1';
  }

  // Default to v1 for backward compatibility
  return 'v1';
}

/**
 * Extract URL from v1 schema
 * @param {Object} data - Data in v1 format
 * @returns {string|null} - Article URL or null
 */
function extractUrlV1(data) {
  return data.original_article?.url || null;
}

/**
 * Extract URL from v2 schema
 * Uses article_url if provided, otherwise generates from document_id
 * @param {Object} data - Data in v2 format
 * @returns {string} - Article URL
 */
function extractUrlV2(data) {
  // Use article_url if provided
  if (data.article_url) {
    return data.article_url;
  }
  // Fallback to document_id
  const documentId = data.document_id || 'unknown';
  return `merged-changes://${documentId}`;
}

/**
 * Extract title from v1 schema
 * @param {Object} data - Data in v1 format
 * @returns {string|null} - Article title
 */
function extractTitleV1(data) {
  return data.original_article?.title || data.corrected_article?.title || null;
}

/**
 * Extract title from v2 schema
 * Attempts to extract title from first line of original_article
 * @param {Object} data - Data in v2 format
 * @returns {string|null} - Article title
 */
function extractTitleV2(data) {
  if (typeof data.original_article === 'string') {
    const firstLine = data.original_article.split('\n')[0];
    return firstLine.substring(0, 200); // Limit title length
  }
  return null;
}

/**
 * Apply merged_changes to original text to generate corrected text
 * @param {string} originalText - Original article text
 * @param {Array} mergedChanges - Array of changes to apply
 * @returns {string} - Corrected text
 */
function applyMergedChanges(originalText, mergedChanges) {
  if (!mergedChanges || mergedChanges.length === 0) {
    return originalText;
  }

  // Sort changes by position (descending) to apply from end to start
  // This prevents position shifts during replacement
  const sortedChanges = [...mergedChanges].sort((a, b) => b.char_start - a.char_start);

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
}

/**
 * Normalize v2 data for database storage
 * Converts v2 schema to a format compatible with existing database structure
 * while preserving v2-specific data
 * @param {Object} data - Data in v2 format
 * @returns {Object} - Normalized data
 */
function normalizeV2(data) {
  const url = extractUrlV2(data);
  const title = extractTitleV2(data);

  // Create original_article object (v1 compatible)
  const originalArticle = {
    url,
    title,
    body: data.original_article || ''
  };

  // Use provided corrected_article if available, otherwise generate it
  let correctedText;
  if (data.corrected_article && typeof data.corrected_article === 'string') {
    // Corrected article provided as string
    correctedText = data.corrected_article;
  } else if (data.corrected_article && data.corrected_article.body) {
    // Corrected article provided as object with body
    correctedText = data.corrected_article.body;
  } else {
    // Generate corrected text by applying merged_changes
    correctedText = applyMergedChanges(
      data.original_article || '',
      data.merged_changes || []
    );
  }

  // Create corrected_article object (v1 compatible)
  const correctedArticle = {
    title: data.corrected_article?.title || title,
    body: correctedText
  };

  // Convert merged_changes to applied format for v1 compatibility
  const applied = (data.merged_changes || []).map(change => ({
    agent: change.primary_agent_id || 'unknown',
    path: change.section_id || 'body',
    before: change.original_text,
    after: change.suggested_text,
    metadata: {
      change_id: change.id,
      status: change.status,
      severity: change.severity,
      confidence: change.confidence,
      categories: change.categories,
      agent_ids: change.agent_ids,
      explanations: change.explanations,
      char_start: change.char_start,
      char_end: change.char_end
    }
  }));

  return {
    article_id: data.document_id,
    original_article: originalArticle,
    corrected_article: correctedArticle,
    applied,
    unapplied: [],
    // Store v2-specific data
    schema_version: 'v2',
    merged_changes: data.merged_changes
  };
}

/**
 * Validate v1 schema data
 * @param {Object} data - Data to validate
 * @returns {Object} - { valid: boolean, error: string|null }
 */
function validateV1(data) {
  if (!data.corrected_article) {
    return { valid: false, error: 'Missing required field: corrected_article' };
  }

  const hasContent =
    (data.corrected_article.body &&
     ((Array.isArray(data.corrected_article.body) && data.corrected_article.body.length > 0) ||
      (typeof data.corrected_article.body === 'string' && data.corrected_article.body.trim().length > 0))) ||
    (data.original_article?.body &&
     typeof data.original_article.body === 'string' &&
     data.original_article.body.trim().length > 0);

  if (!hasContent) {
    return { valid: false, error: 'Correction must have content in body field' };
  }

  return { valid: true, error: null };
}

/**
 * Validate v2 schema data
 * @param {Object} data - Data to validate
 * @returns {Object} - { valid: boolean, error: string|null }
 */
function validateV2(data) {
  if (!data.original_article || typeof data.original_article !== 'string') {
    return { valid: false, error: 'Missing or invalid required field: original_article (must be string)' };
  }

  if (!data.merged_changes || !Array.isArray(data.merged_changes)) {
    return { valid: false, error: 'Missing or invalid required field: merged_changes (must be array)' };
  }

  if (data.original_article.trim().length === 0) {
    return { valid: false, error: 'original_article cannot be empty' };
  }

  return { valid: true, error: null };
}

/**
 * Process incoming data - detect schema, validate, and normalize
 * @param {Object} data - Raw incoming data
 * @returns {Object} - { success: boolean, data: Object|null, error: string|null, schema: string }
 */
function processIncomingData(data) {
  const schema = detectSchema(data);

  // Validate
  let validation;
  if (schema === 'v1') {
    validation = validateV1(data);
  } else {
    validation = validateV2(data);
  }

  if (!validation.valid) {
    return {
      success: false,
      data: null,
      error: validation.error,
      schema
    };
  }

  // Normalize v2 to v1-compatible format while preserving v2 data
  let processedData;
  if (schema === 'v2') {
    processedData = normalizeV2(data);
  } else {
    processedData = {
      ...data,
      schema_version: 'v1'
    };
  }

  return {
    success: true,
    data: processedData,
    error: null,
    schema
  };
}

module.exports = {
  detectSchema,
  processIncomingData,
  applyMergedChanges,
  extractUrlV1,
  extractUrlV2,
  extractTitleV1,
  extractTitleV2,
  normalizeV2,
  validateV1,
  validateV2
};
