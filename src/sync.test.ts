import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { pull } from "./sync.js";
import { getAllObservations, readPersona, readLessons } from "./storage.js";
import type { PullResponse } from "./sync-types.js";

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
    expect(getAllObservations().map((o) => o.observation)).toContain("from-server");
    expect(readPersona()).toBe("SERVER-PERSONA");
    expect(readLessons().map((l) => l.id)).toContain("L-z-1");
  });

  it("degrades to paused on network error without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const result = await pull();
    expect(result.status).toBe("paused");
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("returns skipped when no sync config", async () => {
    delete process.env.ZUG_URL; delete process.env.ZUG_TOKEN;
    const result = await pull();
    expect(result.status).toBe("skipped");
  });
});
