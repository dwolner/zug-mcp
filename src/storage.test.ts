import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readPersona, writePersona,
  readPlaybook, writePlaybook,
  readActive, writeActive,
  appendObservation, getObservationsBySession, archiveObservations,
  archiveSessions,
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
  getLessonCandidates,
  getStaleGrowthWarning,
  wordSimilarity,
  autoReinforceSession,
  recordSynthesisOutcome,
  readSynthesisStatus,
  getSynthesisWarning,
  getFrozenPersonaWarning,
  getAllObservations, getObservationsForSync, getGrowthSince,
  getAllReinforcements, writeReinforcements, addObservations, addGrowth,
  writePersonaAtomic, getAllSessionFiles, addSessionFile,
  writePlaybookAtomic, writeActiveAtomic,
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

describe("getLessonCandidates", () => {
  it("returns empty array when no patterns exist", () => {
    expect(getLessonCandidates(3)).toEqual([]);
  });

  it("returns empty array when no patterns meet threshold", () => {
    reinforcePattern("Some pattern");
    reinforcePattern("Some pattern");
    expect(getLessonCandidates(3)).toHaveLength(0);
  });

  it("returns patterns at or above threshold", () => {
    reinforcePattern("Thinks in systems and relationships");
    reinforcePattern("Thinks in systems and relationships");
    reinforcePattern("Thinks in systems and relationships");
    const candidates = getLessonCandidates(3);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].text).toBe("Thinks in systems and relationships");
    expect(candidates[0].count).toBe(3);
  });

  it("excludes patterns already covered by an existing lesson title", () => {
    reinforcePattern("User prefers concise direct answers");
    reinforcePattern("User prefers concise direct answers");
    reinforcePattern("User prefers concise direct answers");
    createLesson({ title: "User prefers concise direct answers", content: "Keep responses short.", context: "ctx", source: "manual", tags: [] });
    expect(getLessonCandidates(3)).toHaveLength(0);
  });

  it("excludes patterns already covered by an existing lesson content", () => {
    reinforcePattern("User builds systems thinking in layers");
    reinforcePattern("User builds systems thinking in layers");
    reinforcePattern("User builds systems thinking in layers");
    createLesson({ title: "Layered thinking", content: "User builds systems thinking in layers with abstractions.", context: "ctx", source: "manual", tags: [] });
    expect(getLessonCandidates(3)).toHaveLength(0);
  });

  it("respects custom threshold parameter", () => {
    reinforcePattern("Consistent preference pattern");
    reinforcePattern("Consistent preference pattern");
    expect(getLessonCandidates(2)).toHaveLength(1);
    expect(getLessonCandidates(3)).toHaveLength(0);
  });

  it("sorts results by count descending", () => {
    reinforcePattern("First pattern reinforced more");
    reinforcePattern("First pattern reinforced more");
    reinforcePattern("First pattern reinforced more");
    reinforcePattern("First pattern reinforced more");
    reinforcePattern("Second pattern reinforced less");
    reinforcePattern("Second pattern reinforced less");
    reinforcePattern("Second pattern reinforced less");
    const candidates = getLessonCandidates(3);
    expect(candidates[0].count).toBeGreaterThanOrEqual(candidates[1].count);
  });
});

describe("createLesson", () => {
  it("mints source-safe ids of the form L-<tag>-<seq>", () => {
    const a = createLesson({ title: "A", content: "ca", context: "x", source: "manual", tags: [] });
    const b = createLesson({ title: "B", content: "cb", context: "x", source: "manual", tags: [] });
    expect(a.id).toMatch(/^L-[a-z0-9]{6}-1$/);
    expect(b.id).toMatch(/^L-[a-z0-9]{6}-2$/);
    expect(a.id.slice(0, 9)).toBe(b.id.slice(0, 9)); // same source tag prefix "L-xxxxxx"
  });

  it("continues the per-source sequence from existing max", () => {
    createLesson({ title: "A", content: "c", context: "x", source: "manual", tags: [] });
    createLesson({ title: "B", content: "c", context: "x", source: "manual", tags: [] });
    const c = createLesson({ title: "C", content: "c", context: "x", source: "manual", tags: [] });
    expect(c.id).toMatch(/-3$/);
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

describe("getStaleGrowthWarning", () => {
  it("returns null when no snapshots", () => {
    expect(getStaleGrowthWarning()).toBeNull();
  });

  it("returns null when only one snapshot", () => {
    appendGrowthSnapshot(makeSnapshot({ observationCount: 5 }));
    expect(getStaleGrowthWarning()).toBeNull();
  });

  it("returns null when observation count is growing", () => {
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-01T00:00:00.000Z", observationCount: 3 }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-02T00:00:00.000Z", observationCount: 5 }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-03T00:00:00.000Z", observationCount: 8 }));
    expect(getStaleGrowthWarning()).toBeNull();
  });

  it("returns warning string when observation count is flat", () => {
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-01T00:00:00.000Z", observationCount: 10 }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-02T00:00:00.000Z", observationCount: 10 }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-03T00:00:00.000Z", observationCount: 10 }));
    const warning = getStaleGrowthWarning();
    expect(warning).not.toBeNull();
    expect(warning).toContain("No new observations");
    expect(warning).toContain("zug_save_observation");
  });

  it("respects custom n parameter — higher threshold requires more flat sessions", () => {
    // 3 snapshots: first has growth, last two are flat
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-01T00:00:00.000Z", observationCount: 3 }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-02T00:00:00.000Z", observationCount: 5 }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-03T00:00:00.000Z", observationCount: 5 }));
    // n=2: looks at newest 2 (both 5) → warns
    expect(getStaleGrowthWarning(2)).not.toBeNull();
    // n=3: looks at all 3 (3→5→5), min≠max → no warning
    expect(getStaleGrowthWarning(3)).toBeNull();
  });
});

describe("archiveSessions", () => {
  const sessionsDir = () => path.join(tmpDir, "sessions");
  const archiveDir = () => path.join(tmpDir, "sessions", "archive");

  function writeOldSession(name: string, daysAgo: number): string {
    const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const filename = `${dateStr}-${name}.md`;
    fs.mkdirSync(sessionsDir(), { recursive: true });
    fs.writeFileSync(path.join(sessionsDir(), filename), `# Session ${name}`, "utf-8");
    return filename;
  }

  it("moves sessions older than the threshold to sessions/archive/", () => {
    const filename = writeOldSession("old", 100);
    const { archived } = archiveSessions(90);
    expect(archived).toBe(1);
    expect(fs.existsSync(path.join(sessionsDir(), filename))).toBe(false);
    expect(fs.existsSync(path.join(archiveDir(), filename))).toBe(true);
  });

  it("leaves recent sessions in place", () => {
    const filename = writeOldSession("recent", 10);
    const { archived } = archiveSessions(90);
    expect(archived).toBe(0);
    expect(fs.existsSync(path.join(sessionsDir(), filename))).toBe(true);
    expect(fs.existsSync(archiveDir())).toBe(false);
  });

  it("creates the archive directory if it does not exist", () => {
    writeOldSession("old", 91);
    expect(fs.existsSync(archiveDir())).toBe(false);
    archiveSessions(90);
    expect(fs.existsSync(archiveDir())).toBe(true);
  });

  it("is idempotent — re-running does not re-archive already archived files", () => {
    writeOldSession("old", 100);
    archiveSessions(90);
    const { archived } = archiveSessions(90);
    expect(archived).toBe(0);
  });

  it("returns archived count of zero when no sessions exist", () => {
    const { archived } = archiveSessions(90);
    expect(archived).toBe(0);
  });
});

describe("archiveObservations", () => {
  const obs: Observation = {
    timestamp: "2026-01-01T00:00:00.000Z",
    type: "cognitive_pattern",
    observation: "Test observation",
    session_id: "session-x",
    confidence: "high",
  };

  it("moves all observations to observations.archive.jsonl", () => {
    appendObservation(obs);
    archiveObservations();
    const archivePath = path.join(tmpDir, "observations.archive.jsonl");
    const archived = fs.readFileSync(archivePath, "utf-8").split("\n").filter(Boolean);
    expect(archived).toHaveLength(1);
    expect(JSON.parse(archived[0])).toEqual(obs);
  });

  it("truncates observations.jsonl to empty after archiving", () => {
    appendObservation(obs);
    archiveObservations();
    const obsPath = path.join(tmpDir, "observations.jsonl");
    const remaining = fs.readFileSync(obsPath, "utf-8").split("\n").filter(Boolean);
    expect(remaining).toHaveLength(0);
  });

  it("appends to existing archive across multiple calls", () => {
    appendObservation(obs);
    archiveObservations();
    const obs2: Observation = { ...obs, observation: "Second observation" };
    appendObservation(obs2);
    archiveObservations();
    const archivePath = path.join(tmpDir, "observations.archive.jsonl");
    const archived = fs.readFileSync(archivePath, "utf-8").split("\n").filter(Boolean);
    expect(archived).toHaveLength(2);
  });

  it("is a no-op when observations.jsonl is empty", () => {
    fs.writeFileSync(path.join(tmpDir, "observations.jsonl"), "", "utf-8");
    expect(() => archiveObservations()).not.toThrow();
    const archivePath = path.join(tmpDir, "observations.archive.jsonl");
    expect(fs.existsSync(archivePath)).toBe(false);
  });

  it("is a no-op when observations.jsonl does not exist", () => {
    expect(() => archiveObservations()).not.toThrow();
    const archivePath = path.join(tmpDir, "observations.archive.jsonl");
    expect(fs.existsSync(archivePath)).toBe(false);
  });
});

describe("sync storage helpers", () => {
  it("getAllObservations reads live + archive", () => {
    appendObservation({ timestamp: "2026-01-02T00:00:00Z", type: "context", observation: "live", session_id: "s", confidence: "high" });
    archiveObservations(); // moves live -> archive
    appendObservation({ timestamp: "2026-01-03T00:00:00Z", type: "context", observation: "newlive", session_id: "s", confidence: "high" });
    const all = getAllObservations().map((o) => o.observation).sort();
    expect(all).toEqual(["live", "newlive"]);
  });

  it("getObservationsForSync filters by timestamp across live+archive", () => {
    appendObservation({ timestamp: "2026-01-01T00:00:00Z", type: "context", observation: "old", session_id: "s", confidence: "high" });
    appendObservation({ timestamp: "2026-01-05T00:00:00Z", type: "context", observation: "new", session_id: "s", confidence: "high" });
    const out = getObservationsForSync("2026-01-02T00:00:00Z").map((o) => o.observation);
    expect(out).toEqual(["new"]);
  });

  it("addObservations appends only entries not already present", () => {
    appendObservation({ timestamp: "2026-01-01T00:00:00Z", type: "context", observation: "a", session_id: "s", confidence: "high" });
    const added = addObservations([
      { timestamp: "2026-01-01T00:00:00Z", type: "context", observation: "a", session_id: "s", confidence: "high" },
      { timestamp: "2026-01-02T00:00:00Z", type: "context", observation: "b", session_id: "s", confidence: "high" },
    ]);
    expect(added).toBe(1);
    expect(getAllObservations()).toHaveLength(2);
  });

  it("addGrowth appends only new snapshots", () => {
    const g = (ts: string, sid: string) => ({ timestamp: ts, sessionId: sid, sessionCount: 1, observationCount: 1, personaLines: 1, topPatterns: [], activePatternCount: 0, lessonCount: 0 });
    appendGrowthSnapshot(g("2026-01-01T00:00:00Z", "s1"));
    const added = addGrowth([g("2026-01-01T00:00:00Z", "s1"), g("2026-01-02T00:00:00Z", "s2")]);
    expect(added).toBe(1);
    expect(getGrowthSince("2026-01-01T12:00:00Z").map((x) => x.sessionId)).toEqual(["s2"]);
  });

  it("reinforcements round-trip via getAllReinforcements/writeReinforcements", () => {
    writeReinforcements([{ text: "p1", count: 3, lastSeen: "2026-01-01T00:00:00Z" }]);
    expect(getAllReinforcements()).toHaveLength(1);
    expect(getAllReinforcements()[0].count).toBe(3);
  });

  it("getAllSessionFiles + addSessionFile (idempotent by filename)", () => {
    expect(addSessionFile("2026-01-01-s.md", "BODY")).toBe(true);
    expect(addSessionFile("2026-01-01-s.md", "DIFFERENT")).toBe(false);
    const files = getAllSessionFiles();
    expect(files).toHaveLength(1);
    expect(files[0].content).toBe("BODY");
  });

  it("writePersonaAtomic writes via temp+rename", () => {
    writePersonaAtomic("HELLO");
    expect(readPersona()).toBe("HELLO");
  });

  it("getObservationsForSync returns [] for an invalid date", () => {
    appendObservation({ timestamp: "2026-01-01T00:00:00Z", type: "context", observation: "a", session_id: "s", confidence: "high" });
    expect(getObservationsForSync("not-a-date")).toEqual([]);
  });

  it("writePlaybookAtomic and writeActiveAtomic round-trip", () => {
    writePlaybookAtomic("PLAYBOOK-X");
    writeActiveAtomic("ACTIVE-X");
    expect(readPlaybook()).toBe("PLAYBOOK-X");
    expect(readActive()).toBe("ACTIVE-X");
  });
});

// ISS-047: the synthesis outage ran for three months because its only failure signal was a
// console.error on a Fly machine. These make the outcome durable and detectable from data the
// system was already writing every session.
describe("synthesis outcome recording (ISS-047)", () => {
  it("returns null before any synthesis has run", () => {
    expect(readSynthesisStatus()).toBeNull();
  });

  it("roundtrips an outcome with a timestamp", () => {
    recordSynthesisOutcome("ok");
    const status = readSynthesisStatus();
    expect(status?.outcome).toBe("ok");
    expect(status?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("keeps the detail explaining a failure", () => {
    recordSynthesisOutcome("truncated", "hit the 16384-token budget");
    expect(readSynthesisStatus()?.detail).toContain("16384");
  });

  it("overwrites rather than accumulating — only the latest outcome matters", () => {
    recordSynthesisOutcome("timeout");
    recordSynthesisOutcome("ok");
    expect(readSynthesisStatus()?.outcome).toBe("ok");
  });
});

describe("getSynthesisWarning (ISS-047)", () => {
  it("returns null when synthesis has never run", () => {
    expect(getSynthesisWarning()).toBeNull();
  });

  it("returns null when the last synthesis succeeded", () => {
    recordSynthesisOutcome("ok");
    expect(getSynthesisWarning()).toBeNull();
  });

  it("names the failure mode so it is actionable", () => {
    recordSynthesisOutcome("timeout", "Request timed out.");
    const warning = getSynthesisWarning();
    expect(warning).toContain("timeout");
    expect(warning).toContain("Request timed out.");
  });

  it("warns for every non-ok outcome", () => {
    for (const outcome of ["timeout", "truncated", "malformed", "no-api-key", "error"] as const) {
      recordSynthesisOutcome(outcome);
      expect(getSynthesisWarning()).not.toBeNull();
    }
  });
});

// The signature of ISS-045, from data already in growth.jsonl: personaLines pinned at 118 across
// 201 snapshots while observationCount climbed 68 -> 130. getStaleGrowthWarning watched the input
// and so never fired; this watches the output.
describe("getFrozenPersonaWarning (ISS-047)", () => {
  it("returns null with fewer than two snapshots", () => {
    expect(getFrozenPersonaWarning()).toBeNull();
    appendGrowthSnapshot(makeSnapshot({ personaLines: 100, observationCount: 5 }));
    expect(getFrozenPersonaWarning()).toBeNull();
  });

  it("returns null when the persona is growing", () => {
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-01T00:00:00.000Z", personaLines: 100, observationCount: 5 }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-02T00:00:00.000Z", personaLines: 104, observationCount: 7 }));
    expect(getFrozenPersonaWarning()).toBeNull();
  });

  it("returns null when nothing is moving — that is the stale-observation case, not this one", () => {
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-01T00:00:00.000Z", personaLines: 118, observationCount: 68 }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-02T00:00:00.000Z", personaLines: 118, observationCount: 68 }));
    expect(getFrozenPersonaWarning()).toBeNull();
  });

  it("warns when observations accumulate but the persona never changes", () => {
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-01T00:00:00.000Z", personaLines: 118, observationCount: 68 }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-02T00:00:00.000Z", personaLines: 118, observationCount: 99 }));
    appendGrowthSnapshot(makeSnapshot({ timestamp: "2026-01-03T00:00:00.000Z", personaLines: 118, observationCount: 130 }));

    const warning = getFrozenPersonaWarning();
    expect(warning).not.toBeNull();
    expect(warning).toContain("118");
    expect(warning).toContain("68");
    expect(warning).toContain("130");
  });
});

// T-058: the dashboard ports this matcher so a threshold can be tuned visually before ISS-048
// wires it to an automatic gate. Both implementations are pinned to one fixture, so a change to
// either side fails here rather than silently invalidating the tuned value.
describe("wordSimilarity — shared fixture with web/lib/zug-cluster.ts", () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "web", "lib", "__fixtures__", "similarity-pairs.json"), "utf-8"),
  ) as Array<{ name: string; a: string; b: string; jaccard: number; sharedCount: number }>;

  it("has a fixture with meaningful spread, not just trivial cases", () => {
    expect(fixture.length).toBeGreaterThanOrEqual(8);
    expect(new Set(fixture.map((p) => p.sharedCount)).size).toBeGreaterThan(2);
  });

  for (const pair of fixture) {
    it(`${pair.name}`, () => {
      const { jaccard, sharedCount } = wordSimilarity(pair.a, pair.b);
      expect(jaccard).toBeCloseTo(pair.jaccard, 10);
      expect(sharedCount).toBe(pair.sharedCount);
    });
  }
});

// ISS-048: reinforcement never fired, and the T-058 sweep showed that auto-calling the existing
// matcher on full observation prose would have changed nothing -- at the production threshold all
// 131 real observations are mutually unique. The fix is to match on a SHORT canonical pattern key
// the agent supplies, where the same threshold separates cleanly, and to run it automatically.
describe("autoReinforceSession (ISS-048)", () => {
  const obs = (over: Partial<Observation> & { session_id: string }) => {
    appendObservation({
      timestamp: new Date().toISOString(),
      type: "cognitive_pattern",
      observation: "some long prose observation about how they think",
      confidence: "high",
      ...over,
    } as Observation);
  };

  it("does nothing for a session with no observations", () => {
    expect(autoReinforceSession("empty")).toEqual({
      considered: 0, skipped: 0, reinforced: 0, created: 0,
    });
  });

  // The pre-ISS-048 corpus has no pattern keys at all. Those observations must be skipped, not
  // reinforced on their prose -- reinforcing prose is exactly the thing that does not work.
  it("skips observations that carry no pattern key", () => {
    obs({ session_id: "s1" });
    obs({ session_id: "s1" });
    expect(autoReinforceSession("s1")).toEqual({
      considered: 0, skipped: 2, reinforced: 0, created: 0,
    });
    expect(getTopPatterns(10)).toHaveLength(0);
  });

  it("creates a pattern the first time a key is seen", () => {
    obs({ session_id: "s1", pattern: "verifies claims against primary sources" });
    const result = autoReinforceSession("s1");
    expect(result).toEqual({ considered: 1, skipped: 0, reinforced: 0, created: 1 });
    expect(getTopPatterns(10)[0].count).toBe(1);
  });

  it("reinforces across sessions when a later session names the same pattern", () => {
    obs({ session_id: "s1", pattern: "verifies claims against primary sources" });
    autoReinforceSession("s1");
    obs({ session_id: "s2", pattern: "verifies claims against primary sources" });
    const result = autoReinforceSession("s2");
    expect(result).toEqual({ considered: 1, skipped: 0, reinforced: 1, created: 0 });
    expect(getTopPatterns(10)[0].count).toBe(2);
  });

  // The whole point of a canonical key: rephrasing must not fork a new pattern.
  it("matches a rephrased key rather than forking a new pattern", () => {
    obs({ session_id: "s1", pattern: "prefers root cause over workaround" });
    autoReinforceSession("s1");
    obs({ session_id: "s2", pattern: "prefers root-cause fixes over workarounds" });
    autoReinforceSession("s2");
    const patterns = getTopPatterns(10);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].count).toBe(2);
  });

  it("keeps genuinely different patterns apart", () => {
    obs({ session_id: "s1", pattern: "prefers concise responses" });
    obs({ session_id: "s1", pattern: "verifies claims against primary sources" });
    autoReinforceSession("s1");
    expect(getTopPatterns(10)).toHaveLength(2);
  });

  // Recurrence means "across sessions". One chatty session naming the same pattern three times
  // must not promote it to a lesson candidate on its own.
  it("counts a pattern once per session even when named repeatedly within it", () => {
    obs({ session_id: "s1", pattern: "verifies claims against primary sources" });
    obs({ session_id: "s1", pattern: "verifies claims with primary sources" });
    obs({ session_id: "s1", pattern: "verifies claims against primary sources" });
    const result = autoReinforceSession("s1");
    expect(result.considered).toBe(1);
    expect(getTopPatterns(10)[0].count).toBe(1);
  });

  it("ignores a blank or whitespace-only pattern key", () => {
    obs({ session_id: "s1", pattern: "   " });
    expect(autoReinforceSession("s1")).toEqual({
      considered: 0, skipped: 1, reinforced: 0, created: 0,
    });
  });

  // The end-to-end claim of the issue: three sessions naming one pattern makes it promotable,
  // where before nothing ever reached the threshold.
  it("produces a lesson candidate after three sessions, which never happened before", () => {
    for (const id of ["s1", "s2", "s3"]) {
      obs({ session_id: id, pattern: "verifies claims against primary sources" });
      autoReinforceSession(id);
    }
    expect(getTopPatterns(10)[0].count).toBe(3);
    expect(getLessonCandidates(3)).toHaveLength(1);
  });
});
