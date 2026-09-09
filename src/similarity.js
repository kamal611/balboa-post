/**
 * Measures how much of the rewritten article's phrasing overlaps with the
 * source text, using shingles (overlapping N-word sequences). This catches
 * near-verbatim copying and light "spinning" (swapping a few words but
 * keeping the same sentence structure) far better than comparing whole
 * sentences or word counts.
 *
 * Returns a number from 0 (no shared phrasing at all) to 1 (rewritten text
 * is built almost entirely out of phrases lifted from the source).
 */

const SHINGLE_SIZE = 8; // 8-word sequences

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, " ") // strip any HTML tags
    .replace(/[^a-z0-9\s]/g, "") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(text) {
  const words = normalize(text).split(" ").filter(Boolean);
  const result = new Set();
  for (let i = 0; i <= words.length - SHINGLE_SIZE; i++) {
    result.add(words.slice(i, i + SHINGLE_SIZE).join(" "));
  }
  return result;
}

export function overlapRatio(sourceText, rewrittenText) {
  const sourceShingles = shingles(sourceText);
  const rewrittenShingles = shingles(rewrittenText);

  if (rewrittenShingles.size === 0) return 0;

  let shared = 0;
  for (const s of rewrittenShingles) {
    if (sourceShingles.has(s)) shared++;
  }

  return shared / rewrittenShingles.size;
}
