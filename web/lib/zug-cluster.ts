/**
 * Recurrence clustering for the dashboard prototype (T-058).
 *
 * A faithful port of normalizeText / wordSimilarity / findBestMatch from src/storage.ts. Ported
 * rather than imported for the same workspace/tsconfig reason as zug-data.ts.
 *
 * The port being EXACT is load-bearing, not cosmetic: the whole justification for the threshold
 * slider is that a value tuned here transfers to the server-side gate ISS-048 will add. A matcher
 * that drifts would yield a number describing something that does not exist. Both this and the
 * original are asserted against __fixtures__/similarity-pairs.json, so drift fails a test.
 */

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from',
  'are', 'was', 'were', 'has', 'have', 'not', 'but', 'all',
]);

const words = (s: string) =>
  new Set(normalizeText(s).split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w)));

/** Jaccard over content words (>2 chars, not stop words). Kept for fixture parity. */
export function wordSimilarity(a: string, b: string): { jaccard: number; sharedCount: number } {
  const A = words(a);
  const B = words(b);
  const shared = [...A].filter((w) => B.has(w));
  const union = new Set([...A, ...B]).size;
  return { jaccard: union > 0 ? shared.length / union : 0, sharedCount: shared.length };
}

/**
 * Overlap (containment) coefficient: shared / smaller set.
 *
 * Jaccard divides by the union, which caps unequal-length keys: a short key fully contained in a
 * longer one still scores well below 1. Since agents do not write keys at a consistent length, that
 * penalty fires constantly. This is the metric the server matcher gates on.
 */
export function overlapSimilarity(a: string, b: string): { overlap: number; sharedCount: number } {
  const A = words(a);
  const B = words(b);
  const shared = [...A].filter((w) => B.has(w)).length;
  const smaller = Math.min(A.size, B.size);
  return { overlap: smaller > 0 ? shared / smaller : 0, sharedCount: shared };
}

export interface Threshold {
  overlap: number;
  sharedCount: number;
}

/**
 * What the server matcher gates on today. Shown as the baseline so tuning has a reference.
 *
 * sharedCount is the half doing the work: across overlap 0.30-0.60 the ratio barely moves the
 * numbers, while 2 -> 3 lifts precision 70% -> 86% by rejecting pairs like "prefers concise
 * responses" / "prefers verbose responses", which share only two content words and are opposites.
 */
export const PRODUCTION_THRESHOLD: Threshold = { overlap: 0.5, sharedCount: 3 };

export interface Cluster<T> {
  representative: string;
  members: T[];
}

/**
 * Greedy single pass, mirroring reinforcePattern(): each item joins the best existing cluster that
 * clears BOTH gates, or starts a new one. Exact-normalized-match short-circuits, as it does there.
 */
export function clusterTexts<T>(
  items: T[],
  textOf: (item: T) => string,
  threshold: Threshold = PRODUCTION_THRESHOLD,
): Cluster<T>[] {
  const clusters: Cluster<T>[] = [];

  for (const item of items) {
    const text = textOf(item);
    const norm = normalizeText(text);
    let bestIdx = -1;
    let bestSim = 0;

    for (let i = 0; i < clusters.length; i++) {
      if (normalizeText(clusters[i].representative) === norm) {
        bestIdx = i;
        bestSim = 1;
        break;
      }
      const { overlap, sharedCount } = overlapSimilarity(clusters[i].representative, text);
      if (overlap >= threshold.overlap && sharedCount >= threshold.sharedCount && overlap > bestSim) {
        bestSim = overlap;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) clusters[bestIdx].members.push(item);
    else clusters.push({ representative: text, members: [item] });
  }

  return clusters.sort((a, b) => b.members.length - a.members.length);
}
