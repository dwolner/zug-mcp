/**
 * Chart palette for the dashboard prototype (T-058).
 *
 * The brand tokens in tailwind.config.ts are NOT usable as a categorical series palette. Validated
 * against the cream surface (#EDE5D8) with the dataviz validator:
 *
 *   jade/clay/cornflower/ink/seasalt
 *   [FAIL] Lightness band   #22302B 0.295 and #B8C9C0 0.82 fall outside L 0.43-0.77
 *   [FAIL] Chroma floor     4 of 5 below 0.1 -- they read as gray
 *   [WARN] Contrast         #7AA5BF 2.11, #B8C9C0 1.38 -- below 3:1
 *
 * That independently corroborates open issue ISS-044. The set below was derived and re-validated
 * until every check passed with no warnings:
 *
 *   [PASS] Lightness band      all 5 inside L 0.43-0.77
 *   [PASS] Chroma floor        all 5 >= 0.1
 *   [PASS] CVD separation      worst adjacent dE 9.4 (deutan), tritan 9.9
 *   [PASS] Normal-vision floor worst adjacent dE 22.8
 *   [PASS] Contrast vs surface all 5 >= 3:1
 *
 * ORDER IS LOAD-BEARING. The validator checks ADJACENT pairs, and this specific ordering is what
 * clears the CVD threshold -- an earlier ordering put clay next to green and only reached dE 7.1.
 * Assign hues by observation type in this fixed order. Never cycle, never reshuffle, and never add
 * a 6th generated hue: a new type folds into "other".
 */
export const SERIES = [
  { key: 'cognitive_pattern', label: 'cognitive pattern', color: '#A84A22' },
  { key: 'context',           label: 'context',           color: '#2F45A8' },
  { key: 'preference',        label: 'preference',        color: '#0B7D55' },
  { key: 'mistake',           label: 'mistake',           color: '#8A2E75' },
  { key: 'breakthrough',      label: 'breakthrough',      color: '#8F6A00' },
] as const;

export const SERIES_COLOR: Record<string, string> = Object.fromEntries(
  SERIES.map((s) => [s.key, s.color]),
);

export const OTHER_COLOR = '#6B6257';

/** Single hue, light->dark. Magnitude only -- never used to encode identity. */
export const SEQUENTIAL = ['#DCCFC0', '#C2A98F', '#A6825D', '#836035', '#5C4220'] as const;

/**
 * Reserved status colors. Never reused as a series color, and always shipped with an icon and a
 * text label so state is never carried by color alone.
 */
export const STATUS = {
  good: '#0B7D55',
  warning: '#8F6A00',
  critical: '#A3231D',
  neutral: '#6B6257',
} as const;

/**
 * Neutral ink for single-series bands. Deliberately NOT drawn from SERIES: those hues carry
 * observation-type identity elsewhere on the page, and one hue must never denote two things.
 */
export const BAND_INK = '#4A5A54';

export const SURFACE = '#EDE5D8';
export const INK = '#22302B';
export const MUTED = '#6B6257';
/** Recessive by design -- grid lines must not compete with the marks. */
export const GRID = '#D6CBBA';

export function sequentialStep(value: number, max: number): string {
  if (max <= 0) return SEQUENTIAL[0];
  const i = Math.min(SEQUENTIAL.length - 1, Math.floor((value / max) * SEQUENTIAL.length));
  return SEQUENTIAL[Math.max(0, i)];
}
