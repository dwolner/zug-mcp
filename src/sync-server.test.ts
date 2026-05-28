import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { handleSyncPull } from "./sync-server.js";
import { appendObservation, writePersona } from "./storage.js";

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

import { handleSyncPush } from "./sync-server.js";
import { getAllObservations, readLessons } from "./storage.js";
import type { SyncPayload } from "./sync-types.js";

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
});
