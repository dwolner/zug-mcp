import { describe, it, expect } from 'vitest';
import {
  wordSimilarity,
  overlapSimilarity,
  normalizeText,
  clusterTexts,
  PRODUCTION_THRESHOLD,
} from './zug-cluster';
import pairs from './__fixtures__/similarity-pairs.json';

// The fixture holds values computed from the production matcher in src/storage.ts. src/storage.test.ts
// asserts the original against the same file, so any divergence between the two fails a test rather
// than silently producing a threshold tuned against a matcher that does not exist.
describe('wordSimilarity — parity with the server matcher', () => {
  for (const pair of pairs) {
    it(`matches the production matcher: ${pair.name}`, () => {
      const { jaccard, sharedCount } = wordSimilarity(pair.a, pair.b);
      expect(jaccard).toBeCloseTo(pair.jaccard, 10);
      expect(sharedCount).toBe(pair.sharedCount);

      const overlap = overlapSimilarity(pair.a, pair.b);
      expect(overlap.overlap).toBeCloseTo(pair.overlap, 10);
      expect(overlap.sharedCount).toBe(pair.sharedCount);
    });
  }
});

describe('normalizeText', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeText('  Thinks,  in SYSTEMS!  ')).toBe('thinks in systems');
  });
});

describe('clusterTexts', () => {
  const t = (s: string) => s;

  it('returns no clusters for no input', () => {
    expect(clusterTexts([], t)).toEqual([]);
  });

  it('collapses identical texts into one cluster', () => {
    const clusters = clusterTexts(['Thinks in systems', 'Thinks in systems'], t);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(2);
  });

  it('collapses texts differing only by case and punctuation', () => {
    const clusters = clusterTexts(['Thinks in systems!', 'THINKS IN SYSTEMS'], t);
    expect(clusters).toHaveLength(1);
  });

  it('keeps unrelated texts apart', () => {
    const clusters = clusterTexts(
      ['Prefers concise responses without preamble', 'Runs live API research during build sessions'],
      t,
    );
    expect(clusters).toHaveLength(2);
  });

  it('sorts the largest cluster first', () => {
    const clusters = clusterTexts(['alpha beta gamma', 'alpha beta gamma', 'zulu yankee xray'], t);
    expect(clusters[0].members).toHaveLength(2);
  });

  // The reason the slider exists: the threshold is a dial, and its direction must be predictable.
  it('never produces more clusters as the threshold loosens', () => {
    const corpus = [
      'Frames problems by root cause before proposing a fix',
      'Frames problems by root cause first, before proposing any fix',
      'Expects tools to follow their own stated rules',
      'Expects tools to be autonomous without babysitting',
      'Verifies behaviour by running end-to-end tests',
    ];
    const counts = [0.9, 0.7, 0.5, 0.3, 0.1].map(
      (o) => clusterTexts(corpus, t, { overlap: o, sharedCount: 1 }).length,
    );
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it('exposes the production threshold as the baseline', () => {
    expect(PRODUCTION_THRESHOLD).toEqual({ overlap: 0.5, sharedCount: 3 });
  });

  // Mirrors the server-side gate test: opposites sharing only two content words must not cluster.
  it('keeps opposites apart when they differ only in the discriminating word', () => {
    const clusters = clusterTexts(['prefers concise responses', 'prefers verbose responses'], (x) => x);
    expect(clusters).toHaveLength(2);
  });
});
