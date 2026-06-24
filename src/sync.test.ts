import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { pull, push, sync } from "./sync.js";
import { getAllObservations, readPersona, readLessons, appendObservation, writeSession } from "./storage.js";
import { readSyncState } from "./sync-state.js";
import type { PullResponse, PushResult } from "./sync-types.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-"));
  process.env.ZUG_DATA_DIR = dir;
  process.env.ZUG_URL = "https://example.test";
  process.env.ZUG_TOKEN = "tok";
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); delete process.env.ZUG_URL; delete process.env.ZUG_TOKEN; });

const pullResponse = (over: Partial<PullResponse>): PullResponse => ({
  sourceId: "server", observations: [], sessions: [], growth: [], reinforcements: [], lessons: [],
  persona: "", playbook: "", active: "", highWater: "2026-05-28T00:00:00.000Z", ...over,
});

describe("pull", () => {
  it("merges server observations + overwrites persona + merges lessons + advances cursor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(pullResponse({
      observations: [{ timestamp: "2026-05-01T00:00:00Z", type: "context", observation: "from-server", session_id: "s", confidence: "high" }],
      persona: "SERVER-PERSONA",
      lessons: [{ id: "L-z-1", title: "t", content: "c", context: "x", source: "manual", tags: [], status: "active", createdAt: "2026-01-01T00:00:00Z", lastReinforced: "2026-01-01T00:00:00Z", reinforcementCount: 0 }],
    })), { status: 200 })));
    const result = await pull();
    expect(result.status).toBe("ok");
    // Cursor advances to the max entry timestamp seen, NOT the server wall-clock highWater (ISS-043).
    expect(readSyncState().pullSince).toBe("2026-05-01T00:00:00Z");
    expect(getAllObservations().map((o) => o.observation)).toContain("from-server");
    expect(readPersona()).toBe("SERVER-PERSONA");
    expect(readLessons().map((l) => l.id)).toContain("L-z-1");
  });

  it("does NOT advance the cursor past entries on an empty pull, even if highWater leads (ISS-043)", async () => {
    // Server reports a far-future wall-clock highWater but returns no cursor-gated entries.
    // The old code jumped pullSince to highWater, which would permanently skip any entry
    // back-dated before that instant. The cursor must stay put so those entries are still pulled.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(pullResponse({
      observations: [], growth: [], highWater: "2026-12-31T00:00:00.000Z",
    })), { status: 200 })));
    const before = readSyncState().pullSince; // EPOCH default
    await pull();
    expect(readSyncState().pullSince).toBe(before);
  });

  it("advances the cursor to the max of observation and growth timestamps (ISS-043)", async () => {
    // highWater leads both; cursor must land on the newest entry actually seen (the growth one).
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(pullResponse({
      observations: [{ timestamp: "2026-05-01T00:00:00Z", type: "context", observation: "o", session_id: "s", confidence: "high" }],
      growth: [{ timestamp: "2026-05-15T00:00:00Z", sessionId: "s", sessionCount: 1, observationCount: 1, personaLines: 1, topPatterns: [], activePatternCount: 0, lessonCount: 0 }],
      highWater: "2026-12-31T00:00:00.000Z",
    })), { status: 200 })));
    await pull();
    expect(readSyncState().pullSince).toBe("2026-05-15T00:00:00Z");
  });

  it("degrades to paused on network error without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const result = await pull();
    expect(result.status).toBe("paused");
    expect(result.error).toContain("ECONNREFUSED");
    expect(readSyncState().status).toBe("paused");
  });

  it("returns skipped when no sync config", async () => {
    delete process.env.ZUG_URL; delete process.env.ZUG_TOKEN;
    const result = await pull();
    expect(result.status).toBe("skipped");
  });
});

describe("push", () => {
  it("posts entries since cursor and advances pushSince", async () => {
    appendObservation({ timestamp: "2026-05-10T00:00:00Z", type: "context", observation: "local", session_id: "s", confidence: "high" });
    writeSession("s", "# Session s\nDate: 2026-05-10T00:00:00Z\n## Summary\nx");
    let captured: any = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ accepted: { observations: 1 }, highWater: "2026-05-11T00:00:00.000Z" } satisfies PushResult), { status: 200 });
    }));
    const result = await push();
    expect(result.status).toBe("ok");
    expect(captured.observations).toHaveLength(1);
    expect(captured.sourceId).toMatch(/^[a-z0-9]{6}$/);
    // Cursor advances to the max pushed entry timestamp, NOT the server highWater (ISS-043).
    expect(readSyncState().pushSince).toBe("2026-05-10T00:00:00Z");
  });

  it("does NOT advance pushSince past local entries when the server highWater leads (ISS-043)", async () => {
    // No local entries to push; server returns a leading highWater. Cursor must not jump,
    // or a back-dated local observation written later would never be pushed.
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ accepted: {}, highWater: "2026-12-31T00:00:00.000Z" } satisfies PushResult), { status: 200 })));
    const before = readSyncState().pushSince; // EPOCH default
    await push();
    expect(readSyncState().pushSince).toBe(before);
  });

  it("degrades to paused on error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    expect((await push()).status).toBe("paused");
  });
});
