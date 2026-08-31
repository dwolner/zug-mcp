import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Mock synthesize so the gate can be observed without an API key, and so failure can be forced.
vi.mock("./synthesize.js", () => ({ synthesize: vi.fn(async () => null) }));

import { handleSyncPush } from "./sync-server.js";
import { synthesize } from "./synthesize.js";
import { drainSynthesis } from "./synthesis-queue.js";
import type { SyncPayload } from "./sync-types.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-gate-"));
  process.env.ZUG_DATA_DIR = dir;
  vi.mocked(synthesize).mockReset();
  vi.mocked(synthesize).mockResolvedValue(null);
});
afterEach(async () => {
  await drainSynthesis();
  fs.rmSync(dir, { recursive: true, force: true });
});

const payload = (over: Partial<SyncPayload>): SyncPayload => ({
  sourceId: "c", observations: [], sessions: [], growth: [], reinforcements: [], lessons: [], ...over,
});
const obs = (observation: string, timestamp: string, confidence: "low" | "medium" | "high" = "high") => ({
  timestamp, type: "breakthrough" as const, observation, session_id: "s", confidence,
});

const ok = { persona: "P", playbook: "PB", active: "A" };

/** Observation texts passed to the Nth synthesize call. */
const fedTo = (call: number): string[] =>
  vi.mocked(synthesize).mock.calls[call][0].observations.map((o) => o.observation);

describe("ISS-050 — synthesis gates on unsynthesized input, not on one push's delta", () => {
  it("re-feeds observations whose synthesis failed on the next push", async () => {
    await handleSyncPush(payload({ observations: [obs("first", "2026-03-01T00:00:00Z")] }));
    await drainSynthesis();
    expect(fedTo(0)).toEqual(["first"]);

    // synthesize() returned null (failure). The client cursor has advanced, so this push carries
    // only the newer row — but "first" never reached PERSONA and must be retried with it.
    await handleSyncPush(payload({ observations: [obs("second", "2026-03-02T00:00:00Z")] }));
    await drainSynthesis();
    expect(fedTo(1)).toEqual(["first", "second"]);
  });

  it("synthesizes pending input on a push that adds no new rows", async () => {
    await handleSyncPush(payload({ observations: [obs("first", "2026-03-01T00:00:00Z")] }));
    await drainSynthesis();
    expect(vi.mocked(synthesize)).toHaveBeenCalledTimes(1);

    // A duplicate push: obsAdded === 0. The old guard stopped here; "first" is still unsynthesized.
    await handleSyncPush(payload({ observations: [obs("first", "2026-03-01T00:00:00Z")] }));
    await drainSynthesis();
    expect(vi.mocked(synthesize)).toHaveBeenCalledTimes(2);
    expect(fedTo(1)).toEqual(["first"]);
  });

  it("advances the high-water mark only after a successful synthesis", async () => {
    vi.mocked(synthesize).mockResolvedValueOnce(ok);
    await handleSyncPush(payload({ observations: [obs("first", "2026-03-01T00:00:00Z")] }));
    await drainSynthesis();
    expect(fedTo(0)).toEqual(["first"]);

    await handleSyncPush(payload({ observations: [obs("second", "2026-03-02T00:00:00Z")] }));
    await drainSynthesis();
    expect(fedTo(1)).toEqual(["second"]);
  });

  it("does not synthesize when nothing is pending", async () => {
    vi.mocked(synthesize).mockResolvedValueOnce(ok);
    await handleSyncPush(payload({ observations: [obs("first", "2026-03-01T00:00:00Z")] }));
    await drainSynthesis();
    expect(vi.mocked(synthesize)).toHaveBeenCalledTimes(1);

    await handleSyncPush(payload({}));
    await drainSynthesis();
    expect(vi.mocked(synthesize)).toHaveBeenCalledTimes(1);
  });

  it("excludes low-confidence observations from the pending set", async () => {
    await handleSyncPush(payload({ observations: [
      obs("noise", "2026-03-01T00:00:00Z", "low"),
      obs("signal", "2026-03-02T00:00:00Z"),
    ]}));
    await drainSynthesis();
    expect(fedTo(0)).toEqual(["signal"]);
  });

  it("does not synthesize when the only pending observations are low-confidence", async () => {
    await handleSyncPush(payload({ observations: [obs("noise", "2026-03-01T00:00:00Z", "low")] }));
    await drainSynthesis();
    expect(vi.mocked(synthesize)).not.toHaveBeenCalled();
  });

  it("drains a backlog larger than one push, oldest first, without dropping rows", async () => {
    // Simulate three months of observations delivered while every synthesis attempt failed.
    const backlog = Array.from({ length: 5 }, (_, i) =>
      obs(`b${i}`, `2026-03-0${i + 1}T00:00:00Z`));
    for (const o of backlog) {
      await handleSyncPush(payload({ observations: [o] }));
      await drainSynthesis();
    }
    // Every attempt failed, so the final attempt sees the whole backlog in order.
    expect(fedTo(4)).toEqual(["b0", "b1", "b2", "b3", "b4"]);
  });
});
