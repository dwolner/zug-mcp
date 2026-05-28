import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs"; import os from "os"; import path from "path";
import { handleSyncPush, handleSyncPull } from "./sync-server.js";
import {
  appendObservation, getAllObservations, getObservationsForSync, getAllSessionFiles,
  getGrowthSince, getAllReinforcements, readLessons, addObservations, addSessionFile,
} from "./storage.js";
import type { SyncPayload } from "./sync-types.js";

function mkdir() { return fs.mkdtempSync(path.join(os.tmpdir(), "zug-")); }
function use(dir: string) { process.env.ZUG_DATA_DIR = dir; }

const since = "1970-01-01T00:00:00.000Z";
const payloadFrom = (sourceId: string): SyncPayload => ({
  sourceId,
  observations: getObservationsForSync(since),
  sessions: getAllSessionFiles(),
  growth: getGrowthSince(since),
  reinforcements: getAllReinforcements(),
  lessons: readLessons(),
});

describe("two clients converge through the canonical server", () => {
  let server: string, a: string, b: string;
  beforeEach(() => { server = mkdir(); a = mkdir(); b = mkdir(); });
  afterEach(() => { for (const d of [server, a, b]) fs.rmSync(d, { recursive: true, force: true }); delete process.env.ZUG_DATA_DIR; });

  it("an observation made on A appears on B after sync", async () => {
    use(a);
    appendObservation({ timestamp: "2026-05-01T00:00:00Z", type: "context", observation: "from-A", session_id: "sa", confidence: "low" });
    const aPayload = payloadFrom("a");

    use(server);
    await handleSyncPush(aPayload);
    expect(getAllObservations().map((o) => o.observation)).toContain("from-A");

    const pull = handleSyncPull(since);
    use(b);
    addObservations(pull.observations);
    for (const s of pull.sessions) addSessionFile(s.filename, s.content);
    expect(getAllObservations().map((o) => o.observation)).toContain("from-A");
  });
});

describe("offline degradation", () => {
  it("recording works locally with no server, and reconciles on next push", async () => {
    const a = mkdir(); const server = mkdir();
    use(a);
    appendObservation({ timestamp: "2026-05-02T00:00:00Z", type: "context", observation: "offline-note", session_id: "s", confidence: "low" });
    expect(getAllObservations()).toHaveLength(1);
    const p = payloadFrom("a");
    use(server);
    await handleSyncPush(p);
    expect(getAllObservations().map((o) => o.observation)).toContain("offline-note");
    fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(server, { recursive: true, force: true });
  });
});
