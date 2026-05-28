import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { handleSyncPull, handleSyncPush } from "./sync-server.js";
import { appendObservation, writePersona, getAllObservations, readLessons } from "./storage.js";
import type { SyncPayload } from "./sync-types.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-")); process.env.ZUG_DATA_DIR = dir; });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("handleSyncPull", () => {
  it("returns observations since cursor plus projections and highWater", () => {
    appendObservation({ timestamp: "2026-01-01T00:00:00Z", type: "context", observation: "old", session_id: "s", confidence: "high" });
    appendObservation({ timestamp: "2026-05-01T00:00:00Z", type: "context", observation: "new", session_id: "s", confidence: "high" });
    writePersona("PERSONA-CANONICAL");
    const res = handleSyncPull("2026-02-01T00:00:00Z");
    expect(res.observations.map((o) => o.observation)).toEqual(["new"]);
    expect(res.persona).toBe("PERSONA-CANONICAL");
    expect(typeof res.highWater).toBe("string");
  });
});

const emptyPayload = (over: Partial<SyncPayload>): SyncPayload => ({
  sourceId: "client-a", observations: [], sessions: [], growth: [], reinforcements: [], lessons: [], ...over,
});

describe("handleSyncPush", () => {
  it("merges incoming observations idempotently", async () => {
    const p = emptyPayload({ observations: [
      { timestamp: "2026-03-01T00:00:00Z", type: "context", observation: "pushed", session_id: "s", confidence: "low" },
    ]});
    const r1 = await handleSyncPush(p);
    expect(r1.accepted.observations).toBe(1);
    const r2 = await handleSyncPush(p); // re-push
    expect(r2.accepted.observations).toBe(0);
    expect(getAllObservations()).toHaveLength(1);
  });

  it("unions lessons by id without losing either side", async () => {
    const l = (id: string): SyncPayload["lessons"][number] => ({
      id, title: id, content: "c", context: "x", source: "manual", tags: [], status: "active",
      createdAt: "2026-01-01T00:00:00Z", lastReinforced: "2026-01-01T00:00:00Z", reinforcementCount: 0,
    });
    await handleSyncPush(emptyPayload({ lessons: [l("L-a-1")] }));
    await handleSyncPush(emptyPayload({ lessons: [l("L-b-1")] }));
    expect(readLessons().map((x) => x.id).sort()).toEqual(["L-a-1", "L-b-1"]);
  });

  it("reports 0 new reinforcements on re-push of the same set", async () => {
    const r = { text: "likes tabs", count: 2, lastSeen: "2026-01-01T00:00:00Z" };
    const r1 = await handleSyncPush(emptyPayload({ reinforcements: [r] }));
    expect(r1.accepted.reinforcements).toBe(1);
    const r2 = await handleSyncPush(emptyPayload({ reinforcements: [r] }));
    expect(r2.accepted.reinforcements).toBe(0);
  });

  it("merges growth idempotently", async () => {
    const g = { timestamp: "2026-03-01T00:00:00Z", sessionId: "s1", sessionCount: 1, observationCount: 1, personaLines: 1, topPatterns: [], activePatternCount: 0, lessonCount: 0 };
    const r1 = await handleSyncPush(emptyPayload({ growth: [g] }));
    expect(r1.accepted.growth).toBe(1);
    const r2 = await handleSyncPush(emptyPayload({ growth: [g] }));
    expect(r2.accepted.growth).toBe(0);
  });
});
