import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Mock synthesize so we can observe the non-blocking contract without an API key.
vi.mock("./synthesize.js", () => ({ synthesize: vi.fn(async () => null) }));

import { handleSyncPush, handleSyncPull } from "./sync-server.js";
import { synthesize } from "./synthesize.js";
import { runWithTenant } from "./tenancy.js";
import { drainSynthesis } from "./synthesis-queue.js";
import type { SyncPayload } from "./sync-types.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "zug-ss-"));
  process.env.ZUG_DATA_DIR = path.join(root, ".zug");
  process.env.ZUG_USERS_ROOT = path.join(root, "users");
  vi.mocked(synthesize).mockReset();
  vi.mocked(synthesize).mockResolvedValue(null);
});
afterEach(async () => {
  await drainSynthesis();
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.ZUG_USERS_ROOT;
});

const payload = (over: Partial<SyncPayload>): SyncPayload => ({
  sourceId: "c", observations: [], sessions: [], growth: [], reinforcements: [], lessons: [], ...over,
});
const obs = (observation: string) => ({
  timestamp: "2026-05-01T00:00:00Z", type: "breakthrough" as const, observation, session_id: "s", confidence: "high" as const,
});

describe("sync-server multi-tenancy", () => {
  it("isolates pushed observations between tenants", async () => {
    await runWithTenant("alice", () => handleSyncPush(payload({ observations: [obs("alice-obs")] })));
    await runWithTenant("bob", () => handleSyncPush(payload({ observations: [obs("bob-obs")] })));

    const aliceObs = runWithTenant("alice", () =>
      handleSyncPull("1970-01-01T00:00:00.000Z").observations.map((o) => o.observation));
    const bobObs = runWithTenant("bob", () =>
      handleSyncPull("1970-01-01T00:00:00.000Z").observations.map((o) => o.observation));

    expect(aliceObs).toEqual(["alice-obs"]);
    expect(bobObs).toEqual(["bob-obs"]);
  });

  it("returns from push BEFORE synthesis completes (non-blocking contract, PR-9)", async () => {
    let synthDone = false;
    let release!: () => void;
    vi.mocked(synthesize).mockImplementation(
      () => new Promise((resolve) => { release = () => { synthDone = true; resolve(null); }; }),
    );

    await runWithTenant("alice", () => handleSyncPush(payload({ observations: [obs("x")] })));

    // The push has returned, but synthesis is still pending.
    expect(synthDone).toBe(false);
    expect(synthesize).toHaveBeenCalledTimes(1);

    release();
    await drainSynthesis();
    expect(synthDone).toBe(true);
  });
});
