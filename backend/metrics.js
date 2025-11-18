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
// All inputs are plain text strings
function calculateRunMetrics(run, goldStandard, originalArticle) {
  if (!goldStandard) return null;

  const correctedText = run.corrected_article;

  // Calculate similarity
  const similarity = similarityRatio(correctedText, goldStandard);

  // Calculate F1 score
  const f1Metrics = calculateF1Score(originalArticle, correctedText, goldStandard);

  return {
    similarity: Math.round(similarity * 100) / 100,
    edit_distance: levenshteinDistance(correctedText, goldStandard),
    ...f1Metrics,
    // Keep these for backwards compatibility with frontend
    overall_similarity: Math.round(similarity * 100) / 100,
    overall_f1: f1Metrics.f1
  };
}

// Calculate similarity between two runs
function calculateRunSimilarity(run1, run2) {
  const similarity = similarityRatio(
    run1.corrected_article,
    run2.corrected_article
  );

  return Math.round(similarity * 100) / 100;
}

module.exports = {
  levenshteinDistance,
  similarityRatio,
  calculateF1Score,
  calculateRunMetrics,
  calculateRunSimilarity
};
