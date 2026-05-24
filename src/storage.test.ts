import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readPersona, writePersona,
  readPlaybook, writePlaybook,
  readActive, writeActive,
  appendObservation, getObservationsBySession,
  writeSession, getRecentSessions,
  getStats,
  getLastSessionDate,
  getPersonaExcerpt,
  getObservationTrend,
  syncRulesContext,
  getLastSessionSummary,
  getLastSessionTimestamp,
  getObservationsSince,
  reinforcePattern,
  getTopPatterns,
  readLessons,
  writeLessons,
  createLesson,
  getLessonById,
  updateLesson,
  reinforceLesson,
  getActiveLessons,
  appendGrowthSnapshot,
  readGrowthSnapshots,
  getGrowthTrend,
  type Observation,
  type Lesson,
  type GrowthSnapshot,
} from "./storage";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-test-"));
  process.env.ZUG_DATA_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.ZUG_DATA_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("readPersona / writePersona", () => {
  it("returns empty string when file does not exist", () => {
    expect(readPersona()).toBe("");
  });

  it("roundtrips content", () => {
    writePersona("# Persona\nHello world");
    expect(readPersona()).toBe("# Persona\nHello world");
  });
});

describe("readPlaybook / writePlaybook", () => {
  it("returns empty string when file does not exist", () => {
    expect(readPlaybook()).toBe("");
  });

  it("roundtrips content", () => {
    writePlaybook("# Playbook\nDo things");
    expect(readPlaybook()).toBe("# Playbook\nDo things");
  });
});

describe("readActive / writeActive", () => {
  it("returns empty string when file does not exist", () => {
    expect(readActive()).toBe("");
  });

  it("roundtrips content", () => {
    writeActive("Pattern 1\nPattern 2");
    expect(readActive()).toBe("Pattern 1\nPattern 2");
  });
});

describe("appendObservation / getObservationsBySession", () => {
  const obsA: Observation = {
    timestamp: "2026-01-01T00:00:00.000Z",
    type: "cognitive_pattern",
    observation: "Thinks in systems",
    session_id: "session-a",
    confidence: "high",
  };
  const obsB: Observation = {
    timestamp: "2026-01-01T01:00:00.000Z",
    type: "preference",
    observation: "Prefers concise responses",
    session_id: "session-b",
    confidence: "medium",
  };

  it("returns empty array when observations file does not exist", () => {
    expect(getObservationsBySession("session-a")).toEqual([]);
  });

  it("filters observations by session_id", () => {
    appendObservation(obsA);
    appendObservation(obsB);

    expect(getObservationsBySession("session-a")).toEqual([obsA]);
    expect(getObservationsBySession("session-b")).toEqual([obsB]);
    expect(getObservationsBySession("session-x")).toEqual([]);
  });

  it("accumulates multiple observations for the same session", () => {
    const obsA2: Observation = { ...obsA, observation: "Also builds systems" };
    appendObservation(obsA);
    appendObservation(obsA2);

    const results = getObservationsBySession("session-a");
    expect(results).toHaveLength(2);
    expect(results[0].observation).toBe("Thinks in systems");
    expect(results[1].observation).toBe("Also builds systems");
  });

  it("skips malformed JSONL lines without throwing", () => {
    const { observationsFile } = getPaths();
    // Write a valid line, a corrupt line, then another valid line
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      observationsFile,
      JSON.stringify(obsA) + "\nnot-json\n" + JSON.stringify(obsB) + "\n",
      "utf-8",
    );
    expect(getObservationsBySession("session-a")).toEqual([obsA]);
    expect(getObservationsBySession("session-b")).toEqual([obsB]);
  });
});

// Expose getPaths for direct path access in tests
function getPaths() {
  const zugDir = process.env.ZUG_DATA_DIR!;
  return {
    observationsFile: path.join(zugDir, "observations.jsonl"),
    lessonsFile: path.join(zugDir, "lessons.jsonl"),
    growthFile: path.join(zugDir, "growth.jsonl"),
  };
}

describe("writeSession / getRecentSessions", () => {
  it("returns empty array when sessions directory is empty", () => {
    expect(getRecentSessions(10)).toEqual([]);
  });

  it("returns sessions in reverse sort order", () => {
    writeSession("alpha", "Alpha content");
    writeSession("beta", "Beta content");

    const sessions = getRecentSessions(10);
    expect(sessions).toHaveLength(2);
    // 'beta' sorts after 'alpha', so reverse gives beta first
    expect(sessions[0]).toContain("Beta content");
    expect(sessions[1]).toContain("Alpha content");
  });

  it("respects the limit", () => {
    writeSession("a", "A content");
    writeSession("b", "B content");
    writeSession("c", "C content");

    expect(getRecentSessions(2)).toHaveLength(2);
  });

  it("filters sessions by context tag", () => {
    writeSession("work", "Context: work\nWork session content");
    writeSession("personal", "Context: personal\nPersonal session content");

    const workSessions = getRecentSessions(10, "work");
    expect(workSessions).toHaveLength(1);
    expect(workSessions[0]).toContain("Work session content");
  });

  it("returns no sessions when context does not match any file", () => {
    writeSession("work", "Context: work\nWork session content");
    expect(getRecentSessions(10, "personal")).toEqual([]);
  });

  it("prefixes each result with the filename as a heading", () => {
    writeSession("mysession", "Some content");
    const sessions = getRecentSessions(10);
    expect(sessions[0]).toMatch(/^## \d{4}-\d{2}-\d{2}-mysession\.md/);
  });
});

describe("getStats", () => {
  it("returns zeros when nothing exists", () => {
    expect(getStats()).toEqual({ sessions: 0, observations: 0, personaLines: 0 });
  });

  it("counts sessions, observations, and persona lines", () => {
    writeSession("a", "content a");
    writeSession("b", "content b");
    appendObservation({
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "cognitive_pattern",
      observation: "Test observation",
      session_id: "session-a",
      confidence: "high",
    });
    writePersona("Line 1\nLine 2\nLine 3");

    const stats = getStats();
    expect(stats.sessions).toBe(2);
    expect(stats.observations).toBe(1);
    expect(stats.personaLines).toBe(3);
  });
});

describe("getLastSessionDate", () => {
  it("returns null when no sessions exist", () => {
    expect(getLastSessionDate()).toBeNull();
  });

  it("returns the date of the most recent session", () => {
    writeSession("alpha", "content");
    writeSession("beta", "content");
    const date = getLastSessionDate();
    // date is today's date since writeSession uses new Date()
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getPersonaExcerpt", () => {
  it("returns empty string when PERSONA.md does not exist", () => {
    expect(getPersonaExcerpt()).toBe("");
  });

  it("skips blank lines and heading lines", () => {
    writePersona("# Cognitive Fingerprint\n\n## How you think\n\nThinks in systems.\nMoves top-down.");
    expect(getPersonaExcerpt(2)).toBe("Thinks in systems. Moves top-down.");
  });

  it("skips all levels of markdown headings", () => {
    writePersona("### 2026-05-22\n- [cognitive_pattern] Some observation\nActual content here.");
    expect(getPersonaExcerpt(1)).toBe("- [cognitive_pattern] Some observation");
  });

  it("respects maxLines parameter", () => {
    writePersona("Line one\nLine two\nLine three");
    expect(getPersonaExcerpt(1)).toBe("Line one");
    expect(getPersonaExcerpt(3)).toBe("Line one Line two Line three");
  });
});

describe("getObservationTrend", () => {
  it("returns zeros array of length=weeks when no observations exist", () => {
    expect(getObservationTrend(4)).toEqual([0, 0, 0, 0]);
    expect(getObservationTrend(2)).toEqual([0, 0]);
  });

  it("counts observations in the current week", () => {
    appendObservation({
      timestamp: new Date().toISOString(),
      type: "cognitive_pattern",
      observation: "Recent observation",
      session_id: "s1",
      confidence: "high",
    });
    const trend = getObservationTrend(4);
    // The most recent week is the last bucket (index 3)
    expect(trend[3]).toBe(1);
    expect(trend.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("excludes observations outside the rolling window", () => {
    appendObservation({
      timestamp: "2020-01-01T00:00:00.000Z", // far in the past
      type: "preference",
      observation: "Old observation",
      session_id: "s2",
      confidence: "medium",
    });
    const trend = getObservationTrend(4);
    expect(trend.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("syncRulesContext", () => {
  let rulesDir: string;
  let origRulesDir: string | undefined;

  beforeEach(() => {
    rulesDir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-rules-test-"));
    origRulesDir = process.env.CLAUDE_RULES_DIR;
    process.env.CLAUDE_RULES_DIR = rulesDir;
  });

  afterEach(() => {
    if (origRulesDir !== undefined) {
      process.env.CLAUDE_RULES_DIR = origRulesDir;
    } else {
      delete process.env.CLAUDE_RULES_DIR;
    }
    fs.rmSync(rulesDir, { recursive: true, force: true });
  });

  it("does nothing when ACTIVE.md and PERSONA.md are both empty", () => {
    syncRulesContext();
    expect(fs.existsSync(path.join(rulesDir, "zug-context.md"))).toBe(false);
  });

  it("writes active patterns when ACTIVE.md has content", () => {
    writeActive("When X → do Y\nWhen Z → do W");
    syncRulesContext();
    const content = fs.readFileSync(path.join(rulesDir, "zug-context.md"), "utf-8");
    expect(content).toContain("## Active Patterns");
    expect(content).toContain("When X → do Y");
  });

  it("writes persona excerpt when PERSONA.md has content", () => {
    writePersona("# Title\n\nThinks in systems. Moves top-down.");
    syncRulesContext();
    const content = fs.readFileSync(path.join(rulesDir, "zug-context.md"), "utf-8");
    expect(content).toContain("## Who you're working with");
    expect(content).toContain("Thinks in systems.");
  });

  it("includes auto-generation comment", () => {
    writeActive("Pattern 1");
    syncRulesContext();
    const content = fs.readFileSync(path.join(rulesDir, "zug-context.md"), "utf-8");
    expect(content).toContain("Do not edit manually");
  });

  it("silently skips when rules directory does not exist", () => {
    process.env.CLAUDE_RULES_DIR = "/nonexistent/path/that/does/not/exist";
    writeActive("Pattern 1");
    expect(() => syncRulesContext()).not.toThrow();
  });

  it("overwrites the file on each call", () => {
    writeActive("Old pattern");
    syncRulesContext();
    writeActive("New pattern");
    syncRulesContext();
    const content = fs.readFileSync(path.join(rulesDir, "zug-context.md"), "utf-8");
    expect(content).toContain("New pattern");
    expect(content).not.toContain("Old pattern");
  });
});

describe("getLastSessionSummary", () => {
  it("returns null when no sessions exist", () => {
    expect(getLastSessionSummary()).toBeNull();
  });

  it("extracts summary section from most recent session file", () => {
    writeSession("alpha", "# Session alpha\nDate: 2026-01-01T10:00:00.000Z\n\n## Summary\nWorked on X\n\n## Observations\n*none*");
    expect(getLastSessionSummary()).toBe("Worked on X");
  });

  it("returns null when session has no summary section", () => {
    writeSession("nosummary", "# Session nosummary\nDate: 2026-01-01T10:00:00.000Z\n\n## Observations\n*none*");
    expect(getLastSessionSummary()).toBeNull();
  });
});

describe("getLastSessionTimestamp", () => {
  it("returns null when no sessions exist", () => {
    expect(getLastSessionTimestamp()).toBeNull();
  });

  it("extracts Date header from most recent session file", () => {
    writeSession("ts-session", "# Session ts-session\nDate: 2026-05-22T14:30:00.000Z\n\n## Summary\nDone");
    const ts = getLastSessionTimestamp();
    expect(ts).toBe("2026-05-22T14:30:00.000Z");
  });
});

describe("getObservationsSince", () => {
  it("returns empty array when no observations file exists", () => {
    expect(getObservationsSince("2026-01-01T00:00:00.000Z")).toEqual([]);
  });

  it("returns only observations after the given timestamp", () => {
    appendObservation({ timestamp: "2026-01-01T10:00:00.000Z", type: "preference", observation: "Old obs", session_id: "s1", confidence: "high" });
    appendObservation({ timestamp: "2026-01-02T10:00:00.000Z", type: "cognitive_pattern", observation: "New obs", session_id: "s2", confidence: "high" });

    const results = getObservationsSince("2026-01-01T12:00:00.000Z");
    expect(results).toHaveLength(1);
    expect(results[0].observation).toBe("New obs");
  });

  it("returns results newest-first", () => {
    appendObservation({ timestamp: "2026-01-01T08:00:00.000Z", type: "preference", observation: "Earlier", session_id: "s1", confidence: "medium" });
    appendObservation({ timestamp: "2026-01-01T09:00:00.000Z", type: "preference", observation: "Later", session_id: "s1", confidence: "medium" });

    const results = getObservationsSince("2026-01-01T00:00:00.000Z");
    expect(results[0].observation).toBe("Later");
    expect(results[1].observation).toBe("Earlier");
  });

  it("returns empty array for invalid since timestamp", () => {
    appendObservation({ timestamp: "2026-01-01T10:00:00.000Z", type: "preference", observation: "obs", session_id: "s1", confidence: "high" });
    expect(getObservationsSince("not-a-date")).toEqual([]);
  });
});

describe("reinforcePattern / getTopPatterns", () => {
  it("creates a new pattern with count 1 on first reinforce", () => {
    const result = reinforcePattern("Thinks in systems");
    expect(result.pattern.count).toBe(1);
    expect(result.pattern.text).toBe("Thinks in systems");
    expect(result.matched).toBe(false);
  });

  it("increments count on subsequent reinforcements", () => {
    reinforcePattern("Thinks in systems");
    reinforcePattern("Thinks in systems");
    const result = reinforcePattern("Thinks in systems");
    expect(result.pattern.count).toBe(3);
  });

  it("tracks separate patterns independently", () => {
    reinforcePattern("Pattern A");
    reinforcePattern("Pattern A");
    reinforcePattern("Pattern B");
    const top = getTopPatterns(10);
    expect(top.find((p) => p.text === "Pattern A")?.count).toBe(2);
    expect(top.find((p) => p.text === "Pattern B")?.count).toBe(1);
  });

  it("returns top patterns sorted by count descending", () => {
    reinforcePattern("Low freq");
    reinforcePattern("High freq");
    reinforcePattern("High freq");
    reinforcePattern("High freq");
    const top = getTopPatterns(2);
    expect(top[0].text).toBe("High freq");
    expect(top[0].count).toBe(3);
    expect(top[1].text).toBe("Low freq");
  });

  it("returns empty array when no reinforcements file exists", () => {
    expect(getTopPatterns(10)).toEqual([]);
  });

  it("respects limit parameter", () => {
    reinforcePattern("A");
    reinforcePattern("B");
    reinforcePattern("C");
    expect(getTopPatterns(2)).toHaveLength(2);
  });

  it("fuzzy matches case-insensitive normalized text", () => {
    reinforcePattern("User prefers concise answers");
    const result = reinforcePattern("user prefers concise answers");
    expect(result.matched).toBe(true);
    expect(result.pattern.count).toBe(2);
  });

  it("fuzzy matches by word overlap above threshold", () => {
    reinforcePattern("User builds systems thinking in layers with careful abstractions");
    const result = reinforcePattern("User thinks in layers and builds careful abstractions");
    expect(result.matched).toBe(true);
    expect(result.pattern.count).toBe(2);
  });

  it("does not fuzzy match unrelated patterns", () => {
    reinforcePattern("User prefers concise answers");
    const result = reinforcePattern("Completely different topic here");
    expect(result.matched).toBe(false);
    expect(result.pattern.count).toBe(1);
  });
});

describe("createLesson", () => {
  it("generates sequential IDs starting at L-001", () => {
    const a = createLesson({ title: "A", content: "ca", context: "ctx", source: "manual", tags: [] });
    const b = createLesson({ title: "B", content: "cb", context: "ctx", source: "manual", tags: [] });
    expect(a.id).toBe("L-001");
    expect(b.id).toBe("L-002");
  });

  it("uses max+1 strategy when IDs have gaps", () => {
    const now = new Date().toISOString();
    writeLessons([
      { id: "L-001", title: "A", content: "ca", context: "ctx", source: "manual", tags: [], status: "active", createdAt: now, lastReinforced: now, reinforcementCount: 0 },
      { id: "L-003", title: "C", content: "cc", context: "ctx", source: "manual", tags: [], status: "active", createdAt: now, lastReinforced: now, reinforcementCount: 0 },
    ]);
    const next = createLesson({ title: "D", content: "cd", context: "ctx", source: "manual", tags: [] });
    expect(next.id).toBe("L-004");
  });

  it("sets status=active, timestamps, reinforcementCount=0", () => {
    const before = new Date().toISOString();
    const lesson = createLesson({ title: "T", content: "c", context: "ctx", source: "manual", tags: [] });
    expect(lesson.status).toBe("active");
    expect(lesson.reinforcementCount).toBe(0);
    expect(lesson.createdAt >= before).toBe(true);
    expect(lesson.lastReinforced).toBe(lesson.createdAt);
  });

  it("round-trips supersedes field correctly", () => {
    const first = createLesson({ title: "Original", content: "old", context: "ctx", source: "manual", tags: [] });
    const second = createLesson({ title: "Replacement", content: "new", context: "ctx", source: "review", tags: [], supersedes: first.id });
    expect(second.supersedes).toBe(first.id);
    expect(getLessonById(second.id)?.supersedes).toBe(first.id);
  });
});

describe("getLessonById", () => {
  it("returns null for unknown ID", () => {
    expect(getLessonById("L-999")).toBeNull();
  });

  it("returns the matching lesson", () => {
    const lesson = createLesson({ title: "T", content: "c", context: "ctx", source: "manual", tags: [] });
    expect(getLessonById(lesson.id)?.id).toBe(lesson.id);
  });
});

describe("updateLesson", () => {
  it("returns null for unknown ID", () => {
    expect(updateLesson("L-999", { title: "x" })).toBeNull();
  });

  it("updates specified fields and persists them", () => {
    const lesson = createLesson({ title: "Old", content: "old", context: "ctx", source: "manual", tags: [] });
    const result = updateLesson(lesson.id, { title: "New", status: "validated" });
    expect(result?.title).toBe("New");
    expect(result?.status).toBe("validated");
    expect(getLessonById(lesson.id)?.title).toBe("New");
  });

  it("partial update preserves unspecified fields", () => {
    const lesson = createLesson({ title: "T", content: "original content", context: "ctx", source: "manual", tags: ["a"] });
    updateLesson(lesson.id, { title: "New title" });
    const updated = getLessonById(lesson.id)!;
    expect(updated.content).toBe("original content");
    expect(updated.tags).toEqual(["a"]);
    expect(updated.source).toBe("manual");
  });

  it("updates status to deprecated correctly", () => {
    const lesson = createLesson({ title: "T", content: "c", context: "ctx", source: "manual", tags: [] });
    updateLesson(lesson.id, { status: "deprecated" });
    expect(getLessonById(lesson.id)?.status).toBe("deprecated");
  });

  it("empty updates {} returns the unchanged lesson", () => {
    const lesson = createLesson({ title: "T", content: "c", context: "ctx", source: "manual", tags: [] });
    const result = updateLesson(lesson.id, {});
    expect(result).toEqual(getLessonById(lesson.id));
  });
});

describe("reinforceLesson", () => {
  it("increments reinforcementCount and updates lastReinforced", () => {
    const lesson = createLesson({ title: "T", content: "c", context: "ctx", source: "manual", tags: [] });
    const before = new Date().toISOString();
    const result = reinforceLesson(lesson.id);
    expect(result?.reinforcementCount).toBe(1);
    expect(result!.lastReinforced >= before).toBe(true);
    expect(getLessonById(lesson.id)?.reinforcementCount).toBe(1);
  });

  it("returns null for unknown ID", () => {
    expect(reinforceLesson("L-999")).toBeNull();
  });
});

describe("getActiveLessons", () => {
  it("returns empty array when no lessons exist", () => {
    expect(getActiveLessons()).toEqual([]);
  });

  it("excludes deprecated and validated lessons", () => {
    const active = createLesson({ title: "Active", content: "c", context: "ctx", source: "manual", tags: [] });
    updateLesson(active.id, { status: "active" });
    const dep = createLesson({ title: "Deprecated", content: "c", context: "ctx", source: "manual", tags: [] });
    updateLesson(dep.id, { status: "deprecated" });
    const val = createLesson({ title: "Validated", content: "c", context: "ctx", source: "manual", tags: [] });
    updateLesson(val.id, { status: "validated" });
    const results = getActiveLessons();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(active.id);
  });

  it("sorts by reinforcementCount descending", () => {
    const low = createLesson({ title: "Low", content: "c", context: "ctx", source: "manual", tags: [] });
    const high = createLesson({ title: "High", content: "c", context: "ctx", source: "manual", tags: [] });
    reinforceLesson(high.id);
    reinforceLesson(high.id);
    const results = getActiveLessons();
    expect(results[0].id).toBe(high.id);
    expect(results[1].id).toBe(low.id);
  });

  it("uses createdAt asc as tie-break (explicit strings, no wall clock)", () => {
    const now = new Date().toISOString();
    writeLessons([
      { id: "L-001", title: "Later", content: "c", context: "ctx", source: "manual" as const, tags: [], status: "active" as const, createdAt: "2026-01-02T00:00:00.000Z", lastReinforced: now, reinforcementCount: 0 },
      { id: "L-002", title: "Earlier", content: "c", context: "ctx", source: "manual" as const, tags: [], status: "active" as const, createdAt: "2026-01-01T00:00:00.000Z", lastReinforced: now, reinforcementCount: 0 },
    ]);
    const results = getActiveLessons();
    expect(results[0].id).toBe("L-002"); // earlier createdAt wins
    expect(results[1].id).toBe("L-001");
  });
});

describe("readLessons / writeLessons", () => {
  it("returns empty array when lessons file does not exist", () => {
    expect(readLessons()).toEqual([]);
  });

  it("skips malformed JSONL lines without throwing", () => {
    const { lessonsFile } = getPaths();
    fs.mkdirSync(tmpDir, { recursive: true });
    const now = new Date().toISOString();
    const valid: Lesson = { id: "L-001", title: "T", content: "c", context: "ctx", source: "manual", tags: [], status: "active", createdAt: now, lastReinforced: now, reinforcementCount: 0 };
    fs.writeFileSync(lessonsFile, JSON.stringify(valid) + "\nnot-json\n", "utf-8");
    const results = readLessons();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("L-001");
  });
});

function makeSnapshot(overrides: Partial<GrowthSnapshot> = {}): GrowthSnapshot {
  return {
    timestamp: new Date().toISOString(),
    sessionId: "test-session",
    sessionCount: 1,
    observationCount: 5,
    personaLines: 20,
    topPatterns: [{ text: "Ask before explaining", count: 3 }],
    activePatternCount: 4,
    lessonCount: 2,
    ...overrides,
  };
}

describe("appendGrowthSnapshot / readGrowthSnapshots", () => {
  it("returns empty array when file does not exist", () => {
    expect(readGrowthSnapshots()).toEqual([]);
  });

  it("appends a record readable by readGrowthSnapshots", () => {
    const snap = makeSnapshot();
    appendGrowthSnapshot(snap);
    const results = readGrowthSnapshots();
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe("test-session");
    expect(results[0].sessionCount).toBe(1);
  });

  it("multiple appends accumulate correctly", () => {
    appendGrowthSnapshot(makeSnapshot({ sessionId: "s1", sessionCount: 1 }));
    appendGrowthSnapshot(makeSnapshot({ sessionId: "s2", sessionCount: 2 }));
    appendGrowthSnapshot(makeSnapshot({ sessionId: "s3", sessionCount: 3 }));
    const results = readGrowthSnapshots();
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.sessionId)).toEqual(["s1", "s2", "s3"]);
  });

  it("skips malformed lines without throwing", () => {
    const { growthFile } = getPaths();
    fs.mkdirSync(tmpDir, { recursive: true });
    const snap = makeSnapshot({ sessionId: "valid" });
    fs.writeFileSync(growthFile, JSON.stringify(snap) + "\nnot-json\n", "utf-8");
    const results = readGrowthSnapshots();
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe("valid");
  });
});

describe("getGrowthTrend", () => {
  it("returns most recent N records newest first", () => {
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-01T00:00:00.000Z", sessionId: "oldest" }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-03T00:00:00.000Z", sessionId: "newest" }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-02T00:00:00.000Z", sessionId: "middle" }));
    const trend = getGrowthTrend(2);
    expect(trend).toHaveLength(2);
    expect(trend[0].sessionId).toBe("newest");
    expect(trend[1].sessionId).toBe("middle");
  });

  it("returns all records when limit exceeds count", () => {
    appendGrowthSnapshot(makeSnapshot({ sessionId: "only" }));
    const trend = getGrowthTrend(10);
    expect(trend).toHaveLength(1);
  });
});
