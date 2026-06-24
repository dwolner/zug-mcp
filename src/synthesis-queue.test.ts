import { describe, it, expect, afterEach } from "vitest";
import { enqueueSynthesis, drainSynthesis, activeChainCount } from "./synthesis-queue.js";

afterEach(async () => { await drainSynthesis(); });

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("synthesis-queue", () => {
  it("serializes tasks for the same user (later task waits even if faster)", async () => {
    const order: string[] = [];
    enqueueSynthesis("alice", async () => { await delay(20); order.push("a1"); });
    enqueueSynthesis("alice", async () => { await delay(1); order.push("a2"); });
    await drainSynthesis();
    expect(order).toEqual(["a1", "a2"]);
  });

  it("runs different users concurrently — one user can't block another", async () => {
    let bRan = false;
    let releaseA!: () => void;
    const aGate = new Promise<void>((r) => { releaseA = r; });
    const aTask = enqueueSynthesis("alice", async () => { await aGate; });
    const bTask = enqueueSynthesis("bob", async () => { bRan = true; });
    await bTask; // resolves without waiting for alice's still-blocked task
    expect(bRan).toBe(true);
    releaseA();
    await aTask;
  });

  it("isolates task errors — a failing task does not wedge the chain", async () => {
    const ran: string[] = [];
    enqueueSynthesis("alice", async () => { throw new Error("boom"); });
    enqueueSynthesis("alice", async () => { ran.push("after"); });
    await drainSynthesis();
    expect(ran).toEqual(["after"]);
  });

  it("evicts the per-user chain entry after it settles (PR-6: bounded memory)", async () => {
    enqueueSynthesis("alice", async () => {});
    enqueueSynthesis("bob", async () => {});
    expect(activeChainCount()).toBeGreaterThan(0);
    await drainSynthesis();
    await delay(0); // let the .finally eviction microtask flush
    expect(activeChainCount()).toBe(0);
  });

  it("runs no-tenant (local) tasks under a shared chain without a scope", async () => {
    const ran: string[] = [];
    enqueueSynthesis(undefined, async () => { ran.push("local1"); });
    enqueueSynthesis(undefined, async () => { ran.push("local2"); });
    await drainSynthesis();
    expect(ran).toEqual(["local1", "local2"]);
  });
});
