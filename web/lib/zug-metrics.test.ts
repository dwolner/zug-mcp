import { describe, it, expect } from 'vitest';
import {
  weekStart,
  observationsPerWeek,
  sessionsPerDay,
  personaLineHistory,
  consolidationGap,
  typeConfidenceBreakdown,
  pipelineHealth,
  synthesisBacklog,
  resolveContext,
  contextBuckets,
  contextCoverage,
  filterByContext,
  UNKNOWN_CONTEXT,
} from './zug-metrics';
import { parsePersonaSections, parseSessionHeader } from './zug-data';
import type { GrowthSnapshot, Observation, SynthesisStatus } from './zug-data';

const obs = (timestamp: string, over: Partial<Observation> = {}): Observation => ({
  timestamp,
  type: 'cognitive_pattern',
  observation: 'x',
  session_id: 's',
  confidence: 'high',
  ...over,
});

const snap = (over: Partial<GrowthSnapshot> = {}): GrowthSnapshot => ({
  timestamp: '2026-01-01T00:00:00.000Z',
  sessionId: 's',
  sessionCount: 1,
  observationCount: 1,
  personaLines: 100,
  topPatterns: [],
  activePatternCount: 5,
  lessonCount: 0,
  ...over,
});

describe('weekStart', () => {
  it('returns null for an unparseable date instead of throwing', () => {
    // This runs inside a server component: a RangeError here is a 500 on the whole page.
    expect(weekStart('not-a-date')).toBeNull();
    expect(weekStart('')).toBeNull();
  });

  it('snaps to the UTC Monday of the containing week', () => {
    expect(weekStart('2026-08-30T16:57:00.000Z')).toBe('2026-08-24'); // a Sunday
    expect(weekStart('2026-08-24T00:00:00.000Z')).toBe('2026-08-24'); // the Monday itself
    expect(weekStart('2026-08-25T12:00:00.000Z')).toBe('2026-08-24');
  });
});

describe('observationsPerWeek', () => {
  it('returns nothing for an empty corpus', () => {
    expect(observationsPerWeek([])).toEqual([]);
  });

  it('buckets a single observation into one week', () => {
    expect(observationsPerWeek([obs('2026-08-25T00:00:00.000Z')])).toEqual([
      { date: '2026-08-24', count: 1 },
    ]);
  });

  it('groups the same week and separates different ones, sorted ascending', () => {
    const result = observationsPerWeek([
      obs('2026-08-25T00:00:00.000Z'),
      obs('2026-08-27T00:00:00.000Z'),
      obs('2026-08-18T00:00:00.000Z'),
    ]);
    expect(result).toEqual([
      { date: '2026-08-17', count: 1 },
      { date: '2026-08-24', count: 2 },
    ]);
  });

  it('skips entries with a missing or malformed timestamp rather than throwing', () => {
    const corpus = [obs(''), obs('not-a-date'), obs('2026-08-25T00:00:00.000Z')];
    expect(() => observationsPerWeek(corpus)).not.toThrow();
    expect(observationsPerWeek(corpus)).toEqual([{ date: '2026-08-24', count: 1 }]);
  });
});

describe('sessionsPerDay', () => {
  it('counts by the date prefix, including the doubled-date filenames the real dir uses', () => {
    const result = sessionsPerDay([
      '2026-08-30-2026-08-30-house-tracker-waf.md',
      '2026-08-30-2026-08-29-usbank-account-switch.md',
      '2026-08-27-2026-08-27-devin-claude-config-compat.md',
    ]);
    expect(result).toEqual([
      { date: '2026-08-27', count: 1 },
      { date: '2026-08-30', count: 2 },
    ]);
  });

  it('ignores filenames without a date prefix', () => {
    expect(sessionsPerDay(['README.md', 'notes.md'])).toEqual([]);
  });
});

describe('personaLineHistory', () => {
  it('keeps only the points where the value actually changed', () => {
    const result = personaLineHistory([
      snap({ timestamp: '2026-01-01T00:00:00.000Z', personaLines: 118 }),
      snap({ timestamp: '2026-01-02T00:00:00.000Z', personaLines: 118 }),
      snap({ timestamp: '2026-01-03T00:00:00.000Z', personaLines: 121 }),
      snap({ timestamp: '2026-01-04T00:00:00.000Z', personaLines: 121 }),
      snap({ timestamp: '2026-01-05T00:00:00.000Z', personaLines: 118 }),
    ]);
    expect(result.map((r) => r.personaLines)).toEqual([118, 121, 118]);
  });

  it('sorts unordered input before reducing', () => {
    const result = personaLineHistory([
      snap({ timestamp: '2026-01-03T00:00:00.000Z', personaLines: 130 }),
      snap({ timestamp: '2026-01-01T00:00:00.000Z', personaLines: 118 }),
    ]);
    expect(result.map((r) => r.personaLines)).toEqual([118, 130]);
  });
});

describe('consolidationGap', () => {
  it('returns null without enough history', () => {
    expect(consolidationGap([])).toBeNull();
    expect(consolidationGap([snap()])).toBeNull();
  });

  it('returns null when the persona changed on the latest snapshot', () => {
    expect(
      consolidationGap([
        snap({ timestamp: '2026-01-01T00:00:00.000Z', personaLines: 118 }),
        snap({ timestamp: '2026-01-02T00:00:00.000Z', personaLines: 126 }),
      ]),
    ).toBeNull();
  });

  // The real ISS-045 shape: observations climbing, persona flat.
  it('measures the trailing flat run and the observations that arrived during it', () => {
    const gap = consolidationGap([
      snap({ timestamp: '2026-05-20T00:00:00.000Z', personaLines: 110, observationCount: 60 }),
      snap({ timestamp: '2026-05-26T00:00:00.000Z', personaLines: 118, observationCount: 68 }),
      snap({ timestamp: '2026-07-01T00:00:00.000Z', personaLines: 118, observationCount: 99 }),
      snap({ timestamp: '2026-08-30T00:00:00.000Z', personaLines: 118, observationCount: 130 }),
    ]);
    expect(gap).toEqual({
      personaLines: 118,
      frozenSince: '2026-05-26T00:00:00.000Z',
      sessions: 3,
      observationsAtFreeze: 68,
      observationsNow: 130,
      observationsAccumulated: 62,
    });
  });

  // The series really does contain 118 -> 121 -> 118 excursions; the trailing-run definition has
  // to stay well-defined across them rather than reporting the whole span.
  it('reports only the trailing run when the value briefly excursed and came back', () => {
    const gap = consolidationGap([
      snap({ timestamp: '2026-01-01T00:00:00.000Z', personaLines: 118, observationCount: 10 }),
      snap({ timestamp: '2026-01-02T00:00:00.000Z', personaLines: 121, observationCount: 12 }),
      snap({ timestamp: '2026-01-03T00:00:00.000Z', personaLines: 118, observationCount: 14 }),
      snap({ timestamp: '2026-01-04T00:00:00.000Z', personaLines: 118, observationCount: 20 }),
    ]);
    expect(gap?.frozenSince).toBe('2026-01-03T00:00:00.000Z');
    expect(gap?.sessions).toBe(2);
    expect(gap?.observationsAccumulated).toBe(6);
  });
});

describe('typeConfidenceBreakdown', () => {
  it('counts by type and confidence, largest type first', () => {
    const result = typeConfidenceBreakdown([
      obs('2026-01-01T00:00:00.000Z', { type: 'cognitive_pattern', confidence: 'high' }),
      obs('2026-01-01T00:00:00.000Z', { type: 'cognitive_pattern', confidence: 'medium' }),
      obs('2026-01-01T00:00:00.000Z', { type: 'mistake', confidence: 'high' }),
    ]);
    expect(result[0]).toEqual({
      type: 'cognitive_pattern',
      total: 2,
      byConfidence: { high: 1, medium: 1 },
    });
    expect(result[1].type).toBe('mistake');
  });
});

describe('pipelineHealth', () => {
  // The ISS-048 arithmetic made explicit: getLessonCandidates(3) needs count >= 3, and the real
  // file holds three patterns all at count 1, so no lesson can ever be promoted.
  it('reports that promotion is impossible when no pattern reaches the threshold', () => {
    const health = pipelineHealth(
      [],
      [
        { text: 'a', count: 1, lastSeen: '2026-06-25T00:00:00.000Z' },
        { text: 'b', count: 1, lastSeen: '2026-08-02T00:00:00.000Z' },
        { text: 'c', count: 1, lastSeen: '2026-08-30T00:00:00.000Z' },
      ],
      null,
      0,
    );
    expect(health.reinforcementCount).toBe(3);
    expect(health.maxReinforcement).toBe(1);
    expect(health.canEverPromote).toBe(false);
  });

  it('reports promotion as possible once a pattern reaches the threshold', () => {
    const health = pipelineHealth([], [{ text: 'a', count: 3, lastSeen: 'x' }], null, 0);
    expect(health.canEverPromote).toBe(true);
  });
});

describe('synthesisBacklog (ISS-050 detector)', () => {
  const ok = (lastSynthesizedAt?: string): SynthesisStatus => ({
    outcome: 'ok',
    timestamp: '2026-08-31T16:44:04.983Z',
    ...(lastSynthesizedAt ? { lastSynthesizedAt } : {}),
  });

  it('counts observations newer than the cursor and reports the oldest', () => {
    const result = synthesisBacklog(
      [obs('2026-05-01T00:00:00.000Z'), obs('2026-06-01T00:00:00.000Z'), obs('2026-07-01T00:00:00.000Z')],
      ok('2026-05-15T00:00:00.000Z'),
    );
    expect(result.pending).toBe(2);
    expect(result.oldestPendingAt).toBe('2026-06-01T00:00:00.000Z');
    expect(result.known).toBe(true);
  });

  it('reports nothing pending when the cursor is caught up', () => {
    const result = synthesisBacklog([obs('2026-05-01T00:00:00.000Z')], ok('2026-05-15T00:00:00.000Z'));
    expect(result.pending).toBe(0);
    expect(result.oldestPendingAt).toBeNull();
  });

  it('excludes low-confidence observations, matching the server gate', () => {
    const result = synthesisBacklog(
      [obs('2026-06-01T00:00:00.000Z', { confidence: 'low' }), obs('2026-06-02T00:00:00.000Z')],
      ok('2026-05-15T00:00:00.000Z'),
    );
    expect(result.pending).toBe(1);
    expect(result.oldestPendingAt).toBe('2026-06-02T00:00:00.000Z');
  });

  it('reports backlog as UNKNOWN, not zero, when the server sends no cursor', () => {
    // An older server, or one that never succeeded. Claiming zero would assert a health we cannot
    // verify; claiming the whole corpus would cry wolf on every legacy client.
    const result = synthesisBacklog([obs('2026-06-01T00:00:00.000Z')], ok());
    expect(result.known).toBe(false);
    expect(result.pending).toBe(0);
  });

  it('reports unknown when there is no status at all', () => {
    expect(synthesisBacklog([obs('2026-06-01T00:00:00.000Z')], null).known).toBe(false);
  });

  it('reproduces the real ISS-050 shape: outcome ok while observations sit unabsorbed', () => {
    // The exact condition that read healthy for three months — a successful last batch, and a pile
    // of older observations that were never offered to synthesis at all.
    const stranded = [
      obs('2026-05-28T00:00:00.000Z'),
      obs('2026-06-24T00:00:00.000Z'),
      obs('2026-08-03T00:00:00.000Z'),
    ];
    const health = pipelineHealth([], [], ok('2026-05-15T00:00:00.000Z'), 0, stranded);
    expect(health.synthesis?.outcome).toBe('ok');
    expect(health.backlog.pending).toBe(3);
    expect(health.backlog.oldestPendingAt).toBe('2026-05-28T00:00:00.000Z');
  });
});

describe('parsePersonaSections', () => {
  const raw = [
    '# Cognitive Fingerprint',
    '',
    '## How you construct arguments',
    '- Thinks in systems and relationships',
    '- Verifies system behavior by running tests *(session 2026-05-23)*',
    '- Immediately grasps abstract distinctions *(direct quote: "grasped the gate vs rule distinction"; session 2026-04-24)*',
    '- Expects tools to be autonomous *(raised explicitly twice across sessions; most recent: "Why are you not already auto logging them?")*',
    '',
    '## What excites you',
    '- Ideas that create emergent properties *(2026-03-23)*',
  ].join('\n');

  it('splits on ## headings and keeps bullets under the right one', () => {
    const sections = parsePersonaSections(raw);
    expect(sections.map((s) => s.heading)).toEqual([
      'How you construct arguments',
      'What excites you',
    ]);
    expect(sections[0].bullets).toHaveLength(4);
    expect(sections[1].bullets).toHaveLength(1);
  });

  it('leaves a bullet with no citation alone', () => {
    const b = parsePersonaSections(raw)[0].bullets[0];
    expect(b.text).toBe('Thinks in systems and relationships');
    expect(b.citation).toBeNull();
  });

  it('lifts the date from a "session YYYY-MM-DD" citation and strips it from the text', () => {
    const b = parsePersonaSections(raw)[0].bullets[1];
    expect(b.text).toBe('Verifies system behavior by running tests');
    expect(b.citation?.date).toBe('2026-05-23');
  });

  it('lifts the date from a quote-bearing citation', () => {
    const b = parsePersonaSections(raw)[0].bullets[2];
    expect(b.citation?.date).toBe('2026-04-24');
    expect(b.citation?.raw).toContain('direct quote');
  });

  // The shape that would break a parser assuming every citation carries a date.
  it('keeps a dateless citation, with date null rather than throwing or dropping it', () => {
    const b = parsePersonaSections(raw)[0].bullets[3];
    expect(b.citation).not.toBeNull();
    expect(b.citation?.date).toBeNull();
    expect(b.citation?.raw).toContain('raised explicitly twice');
  });

  // Regression: a greedy end-anchored class matched from the FIRST italic-paren group to the last,
  // swallowing the body text in between. No line in the current PERSONA.md has two groups, which is
  // why nothing caught it -- but that file is generated prose and will eventually produce one.
  it('takes only the trailing citation when a bullet has two italic-paren groups', () => {
    const sections = parsePersonaSections(
      ['## S', '- Prefers X *(see also: karuna)* and expects Y *(2026-05-23)*'].join('\n'),
    );
    const b = sections[0].bullets[0];
    expect(b.text).toBe('Prefers X *(see also: karuna)* and expects Y');
    expect(b.citation?.date).toBe('2026-05-23');
    expect(b.citation?.raw).toBe('2026-05-23');
  });

  it('lifts a bare date citation', () => {
    const b = parsePersonaSections(raw)[1].bullets[0];
    expect(b.text).toBe('Ideas that create emergent properties');
    expect(b.citation?.date).toBe('2026-03-23');
  });
});

describe('parseSessionHeader', () => {
  // The id comes from the header, not the filename: real filenames carry a doubled date prefix,
  // e.g. 2026-08-30-2026-08-29-usbank-account-switch.md
  it('reads the id from the # Session line, not the filename', () => {
    const head = ['# Session 2026-08-29-usbank-account-switch', 'Date: 2026-08-30T04:59:28.423Z', 'Context: work'].join('\n');
    expect(parseSessionHeader(head)).toEqual({
      id: '2026-08-29-usbank-account-switch',
      context: 'work',
    });
  });

  it('returns a null context for a session file that has no Context line', () => {
    expect(parseSessionHeader('# Session s1\nDate: x')).toEqual({ id: 's1', context: null });
  });

  it('returns null when there is no session header at all', () => {
    expect(parseSessionHeader('just some text')).toBeNull();
  });
});

describe('resolveContext', () => {
  const sessions = { s1: 'work', s2: 'personal' };

  it("prefers the observation's own tag over its session's", () => {
    expect(resolveContext(obs('2026-01-01T00:00:00.000Z', { session_id: 's1', context: 'personal' }), sessions))
      .toBe('personal');
  });

  it("inherits the session's context when the observation has none", () => {
    expect(resolveContext(obs('2026-01-01T00:00:00.000Z', { session_id: 's1' }), sessions)).toBe('work');
  });

  it('falls back to unknown when neither carries one', () => {
    expect(resolveContext(obs('2026-01-01T00:00:00.000Z', { session_id: 'gone' }), sessions))
      .toBe(UNKNOWN_CONTEXT);
  });

  it('treats a whitespace-only tag as absent', () => {
    expect(resolveContext(obs('2026-01-01T00:00:00.000Z', { session_id: 's1', context: '  ' }), sessions))
      .toBe('work');
  });
});

describe('contextBuckets', () => {
  const sessions = { s1: 'work' };

  it('counts by resolved context, largest known first', () => {
    const result = contextBuckets(
      [
        obs('2026-01-01T00:00:00.000Z', { session_id: 's1' }),
        obs('2026-01-01T00:00:00.000Z', { session_id: 's1' }),
        obs('2026-01-01T00:00:00.000Z', { session_id: 'x', context: 'personal' }),
      ],
      sessions,
    );
    expect(result).toEqual([
      { context: 'work', count: 2 },
      { context: 'personal', count: 1 },
    ]);
  });

  // unknown is a gap, not a category -- it must never outrank a real context by being bigger.
  it('always sorts unknown last even when it is the largest bucket', () => {
    const result = contextBuckets(
      [
        obs('2026-01-01T00:00:00.000Z', { session_id: 'gone' }),
        obs('2026-01-01T00:00:00.000Z', { session_id: 'gone' }),
        obs('2026-01-01T00:00:00.000Z', { session_id: 'gone' }),
        obs('2026-01-01T00:00:00.000Z', { session_id: 's1' }),
      ],
      sessions,
    );
    expect(result.map((b) => b.context)).toEqual(['work', UNKNOWN_CONTEXT]);
  });

  it('surfaces any context that appears, not a hardcoded work/personal pair', () => {
    const result = contextBuckets([obs('2026-01-01T00:00:00.000Z', { context: 'zug' })], {});
    expect(result).toEqual([{ context: 'zug', count: 1 }]);
  });
});

describe('contextCoverage', () => {
  it('reports zero coverage for an empty corpus without dividing by zero', () => {
    expect(contextCoverage([], {})).toEqual({ total: 0, attributed: 0, unknown: 0, percent: 0 });
  });

  // The shape of the real corpus, which is the reason this exists at all.
  it('reports the attributed share so a partial split cannot read as complete', () => {
    const observations = [
      ...Array.from({ length: 3 }, () => obs('2026-01-01T00:00:00.000Z', { context: 'work' })),
      ...Array.from({ length: 7 }, () => obs('2026-01-01T00:00:00.000Z', { session_id: 'gone' })),
    ];
    expect(contextCoverage(observations, {})).toEqual({
      total: 10, attributed: 3, unknown: 7, percent: 30,
    });
  });
});

describe('filterByContext', () => {
  const sessions = { s1: 'work' };
  const corpus = [
    obs('2026-01-01T00:00:00.000Z', { session_id: 's1' }),
    obs('2026-01-01T00:00:00.000Z', { session_id: 'x', context: 'personal' }),
    obs('2026-01-01T00:00:00.000Z', { session_id: 'gone' }),
  ];

  it('returns everything when no context is selected', () => {
    expect(filterByContext(corpus, sessions, undefined)).toHaveLength(3);
  });

  it('filters on the resolved context, so inherited tags are included', () => {
    expect(filterByContext(corpus, sessions, 'work')).toHaveLength(1);
  });

  it('can select the unknown bucket, so the gap is inspectable rather than hidden', () => {
    expect(filterByContext(corpus, sessions, UNKNOWN_CONTEXT)).toHaveLength(1);
  });

  it('returns nothing for a context that does not appear', () => {
    expect(filterByContext(corpus, sessions, 'nope')).toEqual([]);
  });
});
