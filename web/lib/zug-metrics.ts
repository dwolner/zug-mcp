/**
 * Derived series for the dashboard (T-058). Every function here takes plain data and returns plain
 * data -- no fs, no React -- so the interesting logic is unit-testable under the existing jsdom
 * suite without environment overrides.
 */
import type { GrowthSnapshot, Observation, ReinforcedPattern, SynthesisStatus } from './zug-data';

export interface Bucket {
  date: string;
  count: number;
}

/**
 * UTC Monday of the week containing `iso`, as YYYY-MM-DD. Null when `iso` is not a parseable date.
 *
 * Returns null rather than throwing because everything else in this layer is lenient with bad data
 * -- parseJsonl skips unparseable lines, every reader returns []/null on a broken file -- and this
 * runs inside a server component, so an unhandled RangeError here is a 500 on the whole page rather
 * than one missing bar.
 */
export function weekStart(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

/**
 * Observations bucketed by week, from their own timestamps.
 *
 * Deliberately NOT derived from GrowthSnapshot.sessionCount, which is non-monotonic in the real
 * data (199 -> 200 -> 176 -> 174 -> 216 -> 218 -> 188 -> 233 -> 197 -> 240 -> 190). That field
 * counts whatever is on disk at snapshot time, and 90-day archiving plus multi-device sync makes
 * it bounce. A chart drawn from it would be wrong, not merely noisy.
 */
export function observationsPerWeek(observations: Observation[]): Bucket[] {
  const counts = new Map<string, number>();
  for (const o of observations) {
    const w = o.timestamp ? weekStart(o.timestamp) : null;
    if (w === null) continue; // unparseable timestamps are dropped, not fatal
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Sessions per day, counted from the YYYY-MM-DD prefix of each session filename. */
export function sessionsPerDay(filenames: string[]): Bucket[] {
  const counts = new Map<string, number>();
  for (const f of filenames) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) continue;
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface PersonaTransition {
  timestamp: string;
  personaLines: number;
}

/** personaLines over time, reduced to the points where it actually changed. */
export function personaLineHistory(growth: GrowthSnapshot[]): PersonaTransition[] {
  const sorted = [...growth].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const out: PersonaTransition[] = [];
  for (const s of sorted) {
    if (out.length === 0 || out[out.length - 1].personaLines !== s.personaLines) {
      out.push({ timestamp: s.timestamp, personaLines: s.personaLines });
    }
  }
  return out;
}

export interface ConsolidationGap {
  personaLines: number;
  frozenSince: string;
  sessions: number;
  observationsAtFreeze: number;
  observationsNow: number;
  observationsAccumulated: number;
}

/**
 * The trailing run of snapshots over which personaLines never changed, and how many observations
 * arrived during it. This is the shape of the ISS-045 outage: input accumulating, output static.
 *
 * Defined on the TRAILING run specifically, so it stays well-defined even though the real series
 * contains brief 118->121->118 excursions. Returns null when the persona moved on the last
 * snapshot, or when there is not enough history to say anything.
 */
export function consolidationGap(growth: GrowthSnapshot[]): ConsolidationGap | null {
  const sorted = [...growth].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (sorted.length < 2) return null;

  const current = sorted[sorted.length - 1].personaLines;
  let start = sorted.length - 1;
  while (start > 0 && sorted[start - 1].personaLines === current) start--;
  if (start === sorted.length - 1) return null; // it changed on the most recent snapshot

  const first = sorted[start];
  const last = sorted[sorted.length - 1];
  return {
    personaLines: current,
    frozenSince: first.timestamp,
    sessions: sorted.length - start,
    observationsAtFreeze: first.observationCount,
    observationsNow: last.observationCount,
    observationsAccumulated: last.observationCount - first.observationCount,
  };
}

export interface TypeBreakdown {
  type: string;
  total: number;
  byConfidence: Record<string, number>;
}

export function typeConfidenceBreakdown(observations: Observation[]): TypeBreakdown[] {
  const types = new Map<string, TypeBreakdown>();
  for (const o of observations) {
    const entry = types.get(o.type) ?? { type: o.type, total: 0, byConfidence: {} };
    entry.total += 1;
    entry.byConfidence[o.confidence] = (entry.byConfidence[o.confidence] ?? 0) + 1;
    types.set(o.type, entry);
  }
  return [...types.values()].sort((a, b) => b.total - a.total);
}

export interface PipelineHealth {
  synthesis: SynthesisStatus | null;
  gap: ConsolidationGap | null;
  lessons: number;
  reinforcementCount: number;
  maxReinforcement: number;
  /** Reinforcements never reaching 3 means getLessonCandidates(3) can never return anything. */
  lessonCandidateThreshold: number;
  canEverPromote: boolean;
}

export function pipelineHealth(
  growth: GrowthSnapshot[],
  reinforcements: ReinforcedPattern[],
  synthesis: SynthesisStatus | null,
  lessons: number,
): PipelineHealth {
  const maxReinforcement = reinforcements.reduce((m, r) => Math.max(m, r.count), 0);
  return {
    synthesis,
    gap: consolidationGap(growth),
    lessons,
    reinforcementCount: reinforcements.length,
    maxReinforcement,
    lessonCandidateThreshold: 3,
    canEverPromote: maxReinforcement >= 3,
  };
}


// --- Work / personal differentiation ---
//
// Measured on the real corpus: only 38 of 132 observations carry their own `context`, while 142 of
// 260 session files do. Joining an observation to its session recovers some of the rest; the
// remainder is genuinely unknown and is reported as such rather than dropped, because a split that
// silently omits 64% of the data is worse than no split.

export const UNKNOWN_CONTEXT = 'unknown';

/** Explicit tag wins, then the session's context, then unknown. */
export function resolveContext(
  observation: Observation,
  sessionContexts: Record<string, string>,
): string {
  const own = observation.context?.trim();
  if (own) return own;
  const inherited = sessionContexts[observation.session_id]?.trim();
  if (inherited) return inherited;
  return UNKNOWN_CONTEXT;
}

export interface ContextBucket {
  context: string;
  count: number;
}

/** Buckets are whatever contexts actually appear, so a new tag needs no code change. */
export function contextBuckets(
  observations: Observation[],
  sessionContexts: Record<string, string>,
): ContextBucket[] {
  const counts = new Map<string, number>();
  for (const o of observations) {
    const c = resolveContext(o, sessionContexts);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([context, count]) => ({ context, count }))
    // Known contexts by size, unknown always last -- it is a gap, not a category.
    .sort((a, b) => {
      if (a.context === UNKNOWN_CONTEXT) return 1;
      if (b.context === UNKNOWN_CONTEXT) return -1;
      return b.count - a.count;
    });
}

export interface ContextCoverage {
  total: number;
  attributed: number;
  unknown: number;
  /** Percent of observations with a known context, rounded. 0 when there are none. */
  percent: number;
}

export function contextCoverage(
  observations: Observation[],
  sessionContexts: Record<string, string>,
): ContextCoverage {
  const unknown = observations.filter(
    (o) => resolveContext(o, sessionContexts) === UNKNOWN_CONTEXT,
  ).length;
  const total = observations.length;
  const attributed = total - unknown;
  return {
    total,
    attributed,
    unknown,
    percent: total === 0 ? 0 : Math.round((attributed / total) * 100),
  };
}

/** Undefined context means "all" -- the unfiltered view, not an empty one. */
export function filterByContext(
  observations: Observation[],
  sessionContexts: Record<string, string>,
  context: string | undefined,
): Observation[] {
  if (!context) return observations;
  return observations.filter((o) => resolveContext(o, sessionContexts) === context);
}
