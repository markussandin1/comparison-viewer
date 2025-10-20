// Metrics calculation for comparing corrections with gold standards

// Calculate Levenshtein distance (edit distance) between two strings
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len1][len2];
}

// Calculate similarity ratio (0-1) based on edit distance
function similarityRatio(str1, str2) {
  if (!str1 && !str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const distance = levenshteinDistance(str1, str2);
  const maxLen = Math.max(str1.length, str2.length);

  if (maxLen === 0) return 1.0;

  return 1 - (distance / maxLen);
}

// Tokenize text into words
function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 0);
}

// Calculate Precision, Recall, F1 score
// This compares which words were changed from original -> corrected vs original -> gold
function calculateF1Score(original, corrected, gold) {
  if (!original || !gold) {
    return { precision: 0, recall: 0, f1: 0 };
  }

  const originalTokens = new Set(tokenize(original));
  const correctedTokens = new Set(tokenize(corrected || ''));
  const goldTokens = new Set(tokenize(gold));

  // Changes made by the correction
  const correctedChanges = new Set();
  correctedTokens.forEach(token => {
    if (!originalTokens.has(token)) {
      correctedChanges.add(token);
    }
  });
  originalTokens.forEach(token => {
    if (!correctedTokens.has(token)) {
      correctedChanges.add(`-${token}`); // deletion
    }
  });

  // Changes in gold standard
  const goldChanges = new Set();
  goldTokens.forEach(token => {
    if (!originalTokens.has(token)) {
      goldChanges.add(token);
    }
  });
  originalTokens.forEach(token => {
    if (!goldTokens.has(token)) {
      goldChanges.add(`-${token}`);
    }
  });

  // True positives: changes that match gold
  let truePositives = 0;
  correctedChanges.forEach(change => {
    if (goldChanges.has(change)) {
      truePositives++;
    }
  });

  const falsePositives = correctedChanges.size - truePositives;
  const falseNegatives = goldChanges.size - truePositives;

  const precision = correctedChanges.size > 0
    ? truePositives / correctedChanges.size
    : 0;

  const recall = goldChanges.size > 0
    ? truePositives / goldChanges.size
    : 0;

  const f1 = (precision + recall) > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0;

  return {
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    f1: Math.round(f1 * 100) / 100,
    true_positives: truePositives,
    false_positives: falsePositives,
    false_negatives: falseNegatives
  };
}

// Calculate metrics for a correction run against gold standard
function calculateRunMetrics(run, goldStandard, originalArticle) {
  if (!goldStandard) return null;

  const metrics = {
    overall_similarity: 0,
    title: null,
    lead: null,
    body: null
  };

  let totalSimilarity = 0;
  let fieldCount = 0;

  // Title metrics
  if (goldStandard.title) {
    const originalTitle = originalArticle.title || '';
    const correctedTitle = run.corrected_article.title || '';

    metrics.title = {
      similarity: similarityRatio(correctedTitle, goldStandard.title),
      edit_distance: levenshteinDistance(correctedTitle, goldStandard.title),
      ...calculateF1Score(originalTitle, correctedTitle, goldStandard.title)
    };

    totalSimilarity += metrics.title.similarity;
    fieldCount++;
  }

  // Lead metrics
  if (goldStandard.lead) {
    const originalLead = originalArticle.lead || '';
    const correctedLead = run.corrected_article.lead || '';

    metrics.lead = {
      similarity: similarityRatio(correctedLead, goldStandard.lead),
      edit_distance: levenshteinDistance(correctedLead, goldStandard.lead),
      ...calculateF1Score(originalLead, correctedLead, goldStandard.lead)
    };

    totalSimilarity += metrics.lead.similarity;
    fieldCount++;
  }

  // Body metrics
  if (goldStandard.body) {
    const originalBody = Array.isArray(originalArticle.body)
      ? originalArticle.body.join('\n\n')
      : (originalArticle.body || '');

    const correctedBody = Array.isArray(run.corrected_article.body)
      ? run.corrected_article.body.join('\n\n')
      : (run.corrected_article.body || '');

    metrics.body = {
      similarity: similarityRatio(correctedBody, goldStandard.body),
      edit_distance: levenshteinDistance(correctedBody, goldStandard.body),
      ...calculateF1Score(originalBody, correctedBody, goldStandard.body)
    };

    totalSimilarity += metrics.body.similarity;
    fieldCount++;
  }

  // Overall similarity (average across fields)
  metrics.overall_similarity = fieldCount > 0
    ? Math.round((totalSimilarity / fieldCount) * 100) / 100
    : 0;

  // Overall F1 score (weighted average)
  const f1Scores = [
    metrics.title?.f1,
    metrics.lead?.f1,
    metrics.body?.f1
  ].filter(f1 => f1 !== null && f1 !== undefined);

  metrics.overall_f1 = f1Scores.length > 0
    ? Math.round((f1Scores.reduce((sum, f1) => sum + f1, 0) / f1Scores.length) * 100) / 100
    : 0;

  return metrics;
}

// Calculate similarity between two runs
function calculateRunSimilarity(run1, run2) {
  const similarities = [];

  // Compare titles
  if (run1.corrected_article.title && run2.corrected_article.title) {
    similarities.push(similarityRatio(
      run1.corrected_article.title,
      run2.corrected_article.title
    ));
  }

  // Compare leads
  if (run1.corrected_article.lead && run2.corrected_article.lead) {
    similarities.push(similarityRatio(
      run1.corrected_article.lead,
      run2.corrected_article.lead
    ));
  }

  // Compare bodies
  const body1 = Array.isArray(run1.corrected_article.body)
    ? run1.corrected_article.body.join('\n\n')
    : (run1.corrected_article.body || '');

  const body2 = Array.isArray(run2.corrected_article.body)
    ? run2.corrected_article.body.join('\n\n')
    : (run2.corrected_article.body || '');

  if (body1 && body2) {
    similarities.push(similarityRatio(body1, body2));
  }

  // Average similarity
  const avgSimilarity = similarities.length > 0
    ? similarities.reduce((sum, s) => sum + s, 0) / similarities.length
    : 0;

  return Math.round(avgSimilarity * 100) / 100;
}

module.exports = {
  levenshteinDistance,
  similarityRatio,
  calculateF1Score,
  calculateRunMetrics,
  calculateRunSimilarity
};
