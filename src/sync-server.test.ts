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
