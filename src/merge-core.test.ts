import { describe, it, expect } from "vitest";
import { mergeObservations, mergeSessions, mergeGrowth, mergeReinforcements, mergeLessons } from "./merge-core.js";
import type { Observation, GrowthSnapshot, ReinforcedPattern, Lesson } from "./storage.js";

const obs = (ts: string, text: string): Observation => ({
  timestamp: ts, type: "context", observation: text, session_id: "s", confidence: "high",
});

describe("mergeObservations", () => {
  it("unions, dedupes by timestamp|observation, sorts by timestamp", () => {
    const base = [obs("2026-01-02T00:00:00Z", "b")];
    const incoming = [obs("2026-01-01T00:00:00Z", "a"), obs("2026-01-02T00:00:00Z", "b")];
    const out = mergeObservations(base, incoming);
    expect(out.map((o) => o.observation)).toEqual(["a", "b"]);
  });
});

describe("mergeSessions", () => {
  it("unions by filename, keeps base on conflict", () => {
    const out = mergeSessions(
      [{ filename: "x.md", content: "BASE" }],
      [{ filename: "x.md", content: "OTHER" }, { filename: "y.md", content: "NEW" }],
    );
    expect(out.find((s) => s.filename === "x.md")!.content).toBe("BASE");
    expect(out.map((s) => s.filename).sort()).toEqual(["x.md", "y.md"]);
  });
});

describe("mergeGrowth", () => {
  it("dedupes by timestamp|sessionId", () => {
    const g = (ts: string, sid: string): GrowthSnapshot => ({
      timestamp: ts, sessionId: sid, sessionCount: 1, observationCount: 1, personaLines: 1,
      topPatterns: [], activePatternCount: 0, lessonCount: 0,
    });
    const out = mergeGrowth([g("t1", "a")], [g("t1", "a"), g("t2", "b")]);
    expect(out).toHaveLength(2);
  });
});

describe("mergeReinforcements", () => {
  it("keys by normalized text, keeps max count and latest lastSeen", () => {
    const base: ReinforcedPattern[] = [{ text: "Likes tabs.", count: 2, lastSeen: "2026-01-01T00:00:00Z" }];
    const incoming: ReinforcedPattern[] = [{ text: "likes tabs", count: 5, lastSeen: "2026-02-01T00:00:00Z" }];
    const out = mergeReinforcements(base, incoming);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(5);
    expect(out[0].lastSeen).toBe("2026-02-01T00:00:00Z");
  });
});

describe("mergeLessons", () => {
  const lesson = (id: string, lastReinforced: string, title = "t"): Lesson => ({
    id, title, content: "c", context: "x", source: "manual", tags: [], status: "active",
    createdAt: "2026-01-01T00:00:00Z", lastReinforced, reinforcementCount: 0,
  });
  it("unions by id; on same id keeps latest lastReinforced", () => {
    const out = mergeLessons(
      [lesson("L-a-1", "2026-01-01T00:00:00Z", "old")],
      [lesson("L-a-1", "2026-02-01T00:00:00Z", "new"), lesson("L-b-1", "2026-01-01T00:00:00Z")],
    );
    expect(out).toHaveLength(2);
    expect(out.find((l) => l.id === "L-a-1")!.title).toBe("new");
  });
});
