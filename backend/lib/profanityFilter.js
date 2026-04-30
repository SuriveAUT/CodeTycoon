const LETTER = '[\\W_]*';

const PROFANITY_PATTERNS = [
  new RegExp(`\\bf${LETTER}[uüv]${LETTER}c${LETTER}k(?:${LETTER}(?:er|ing|ed))?\\b`, 'gi'),
  new RegExp(`\\bs${LETTER}h${LETTER}[i1!]${LETTER}t(?:${LETTER}ty)?\\b`, 'gi'),
  new RegExp(`\\bb${LETTER}[i1!]${LETTER}t${LETTER}c${LETTER}h(?:${LETTER}es)?\\b`, 'gi'),
  new RegExp(`\\ba${LETTER}s${LETTER}s${LETTER}h${LETTER}o${LETTER}l${LETTER}e\\b`, 'gi'),
  new RegExp(`\\bd${LETTER}[i1!]${LETTER}c${LETTER}k(?:${LETTER}head)?\\b`, 'gi'),
  new RegExp(`\\bc${LETTER}u${LETTER}n${LETTER}t\\b`, 'gi'),
  new RegExp(`\\bb${LETTER}a${LETTER}s${LETTER}t${LETTER}a${LETTER}r${LETTER}d\\b`, 'gi'),
  new RegExp(`\\bs${LETTER}c${LETTER}h${LETTER}e${LETTER}[i1!]${LETTER}(?:s${LETTER}s|ß)(?:${LETTER}e|${LETTER}er)?\\b`, 'gi'),
  new RegExp(`\\bf${LETTER}[i1!]${LETTER}c${LETTER}k(?:${LETTER}(?:en|er|t|st))?\\b`, 'gi'),
  new RegExp(`\\bw${LETTER}[i1!]${LETTER}c${LETTER}h${LETTER}s${LETTER}e${LETTER}r\\b`, 'gi'),
  new RegExp(`\\bh${LETTER}u${LETTER}r${LETTER}e(?:${LETTER}n${LETTER}s${LETTER}o${LETTER}h${LETTER}n)?\\b`, 'gi'),
  new RegExp(`\\bf${LETTER}o${LETTER}t${LETTER}z${LETTER}e\\b`, 'gi'),
  new RegExp(`\\ba${LETTER}r${LETTER}s${LETTER}c${LETTER}h(?:${LETTER}l${LETTER}o${LETTER}c${LETTER}h)?\\b`, 'gi'),
  new RegExp(`\\bk${LETTER}a${LETTER}c${LETTER}k${LETTER}e\\b`, 'gi'),
  new RegExp(`\\bv${LETTER}e${LETTER}r${LETTER}d${LETTER}a${LETTER}m${LETTER}m${LETTER}t\\b`, 'gi'),
  new RegExp(`\\bn${LETTER}[i1!]${LETTER}g${LETTER}g${LETTER}(?:a|er|ah|uh|ers)?\\b`, 'gi'),
  new RegExp(`\\bn${LETTER}[i1!]${LETTER}g${LETTER}a\\b`, 'gi'),
  new RegExp(`\\bk${LETTER}[i1!]${LETTER}k${LETTER}e\\b`, 'gi'),
  new RegExp(`\\bs${LETTER}p${LETTER}[i1!]${LETTER}c\\b`, 'gi'),
  new RegExp(`\\bc${LETTER}h${LETTER}[i1!]${LETTER}n${LETTER}k\\b`, 'gi'),
  new RegExp(`\\bf${LETTER}a${LETTER}g${LETTER}g?(?:o${LETTER}t)?\\b`, 'gi'),
  new RegExp(`\\bt${LETTER}r${LETTER}a${LETTER}n${LETTER}n${LETTER}y\\b`, 'gi')
];

function maskProfanity(match) {
  const length = Array.from(match).filter((char) => /[A-Za-z0-9ÄÖÜäöüß]/.test(char)).length;
  return '*'.repeat(Math.max(3, Math.min(12, length)));
}

function censorProfanity(text) {
  if (typeof text !== 'string' || !text) return text;
  return PROFANITY_PATTERNS.reduce((clean, pattern) => clean.replace(pattern, maskProfanity), text);
}

function censorChatRows(rows) {
  return (rows || []).map((row) => ({
    ...row,
    message: censorProfanity(row.message || '')
  }));
}

module.exports = {
  censorProfanity,
  censorChatRows
};
