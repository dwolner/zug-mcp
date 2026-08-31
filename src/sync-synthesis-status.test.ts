import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs"; import os from "os"; import path from "path";
import { handleSyncPull } from "./sync-server.js";
import {
  recordSynthesisOutcome, advanceSynthesisHighWater, readSynthesisStatus, writeSynthesisStatus,
} from "./storage.js";

function mkdir() { return fs.mkdtempSync(path.join(os.tmpdir(), "zug-ss-")); }
function use(dir: string) { process.env.ZUG_DATA_DIR = dir; }

const since = "1970-01-01T00:00:00.000Z";

describe("ISS-049 — synthesis status reaches a synced client", () => {
  let server: string, client: string;
  beforeEach(() => { server = mkdir(); client = mkdir(); });
  afterEach(() => {
    for (const d of [server, client]) fs.rmSync(d, { recursive: true, force: true });
    delete process.env.ZUG_DATA_DIR;
  });

  it("includes synthesisStatus in the pull payload", () => {
    use(server);
    recordSynthesisOutcome("timeout", "Request timed out.");
    const pull = handleSyncPull(since);
    expect(pull.synthesisStatus?.outcome).toBe("timeout");
    expect(pull.synthesisStatus?.detail).toBe("Request timed out.");
  });

  it("carries the ISS-050 cursor through, not just the outcome", () => {
    use(server);
    recordSynthesisOutcome("ok");
    advanceSynthesisHighWater("2026-08-31T16:35:30.593Z");
    const pull = handleSyncPull(since);
    expect(pull.synthesisStatus?.lastSynthesizedAt).toBe("2026-08-31T16:35:30.593Z");
  });

  it("is null when the server has never synthesized, rather than absent", () => {
    use(server);
    expect(handleSyncPull(since).synthesisStatus).toBeNull();
  });

  it("lands on the client's local disk so a file reader can see it", () => {
    use(server);
    recordSynthesisOutcome("ok");
    advanceSynthesisHighWater("2026-08-31T16:35:30.593Z");
    const pull = handleSyncPull(since);

    use(client);
    expect(readSynthesisStatus()).toBeNull(); // the ISS-049 symptom, before the write
    if (pull.synthesisStatus) writeSynthesisStatus(pull.synthesisStatus);
    const local = readSynthesisStatus();
    expect(local?.outcome).toBe("ok");
    expect(local?.lastSynthesizedAt).toBe("2026-08-31T16:35:30.593Z");
  });

  it("last-writer-wins from the server: a stale local copy is replaced, not merged", () => {
    use(client);
    recordSynthesisOutcome("error", "stale");
    advanceSynthesisHighWater("2026-01-01T00:00:00.000Z");

    use(server);
    recordSynthesisOutcome("ok");
    advanceSynthesisHighWater("2026-08-31T16:35:30.593Z");
    const pull = handleSyncPull(since);

    use(client);
    if (pull.synthesisStatus) writeSynthesisStatus(pull.synthesisStatus);
    const local = readSynthesisStatus();
    expect(local?.outcome).toBe("ok");
    expect(local?.detail).toBeUndefined();
    expect(local?.lastSynthesizedAt).toBe("2026-08-31T16:35:30.593Z");
  });
});
