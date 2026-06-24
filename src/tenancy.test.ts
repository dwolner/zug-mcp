import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  runWithTenant, getCurrentUserId, assertSafeUserId, toUserId,
  migrateLegacyData, DEFAULT_USER_ID,
} from "./tenancy.js";
import { getPaths, readPersona, writePersona } from "./storage.js";
import { getSourceId } from "./sync-state.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "zug-tenancy-"));
  process.env.ZUG_DATA_DIR = path.join(root, ".zug");
  process.env.ZUG_USERS_ROOT = path.join(root, "users");
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.ZUG_USERS_ROOT;
});

describe("assertSafeUserId / toUserId", () => {
  it("accepts safe ids and rejects traversal, separators, empty, overlong", () => {
    expect(assertSafeUserId("abc-123_DEF")).toBe("abc-123_DEF");
    expect(() => assertSafeUserId("../etc")).toThrow();
    expect(() => assertSafeUserId("a/b")).toThrow();
    expect(() => assertSafeUserId("a.b")).toThrow();
    expect(() => assertSafeUserId("")).toThrow();
    expect(() => assertSafeUserId("a".repeat(65))).toThrow();
  });

  it("passes through safe identities and hashes unsafe ones deterministically", () => {
    expect(toUserId("client-uuid_123")).toBe("client-uuid_123");
    const hashed = toUserId("https://evil/../x");
    expect(hashed).toMatch(/^c-[0-9a-f]{32}$/);
    expect(toUserId("https://evil/../x")).toBe(hashed); // stable
  });
});

describe("getPaths tenancy resolution", () => {
  it("resolves the flat dir without a scope and a namespaced dir within one", () => {
    expect(getPaths().zugDir).toBe(path.join(root, ".zug"));
    const inScope = runWithTenant("alice", () => getPaths().zugDir);
    expect(inScope).toBe(path.join(root, "users", "alice", ".zug"));
  });

  it("getCurrentUserId reflects the active scope", () => {
    expect(getCurrentUserId()).toBeUndefined();
    expect(runWithTenant("alice", () => getCurrentUserId())).toBe("alice");
  });

  it("fully isolates PERSONA between two tenants and from the flat dir", () => {
    runWithTenant("alice", () => writePersona("ALICE"));
    runWithTenant("bob", () => writePersona("BOB"));
    expect(runWithTenant("alice", () => readPersona())).toBe("ALICE");
    expect(runWithTenant("bob", () => readPersona())).toBe("BOB");
    expect(readPersona()).toBe(""); // flat scope untouched
  });

  it("gives each tenant its own source-id (PR-1: createLesson tags are per-user)", () => {
    const a = runWithTenant("alice", () => getSourceId());
    const b = runWithTenant("bob", () => getSourceId());
    expect(a).not.toBe(b);
    expect(runWithTenant("alice", () => getSourceId())).toBe(a); // stable per tenant
    expect(fs.existsSync(path.join(root, "users", "alice", ".zug", "source-id"))).toBe(true);
    expect(fs.existsSync(path.join(root, "users", "bob", ".zug", "source-id"))).toBe(true);
  });
});

describe("migrateLegacyData", () => {
  it("moves flat content into the default namespace, idempotently, leaving control files in place", () => {
    const flat = path.join(root, ".zug");
    fs.mkdirSync(path.join(flat, "sessions"), { recursive: true });
    fs.writeFileSync(path.join(flat, "PERSONA.md"), "P");
    fs.writeFileSync(path.join(flat, "observations.jsonl"), "{}\n");
    fs.writeFileSync(path.join(flat, "sessions", "2026-01-01-s.md"), "S");
    fs.writeFileSync(path.join(flat, "config"), "ZUG_URL=x"); // control file — must stay flat
    fs.writeFileSync(path.join(flat, "sync-state.json"), "{}"); // control file — must stay flat

    const r1 = migrateLegacyData();
    expect(r1.migrated).toBe(true);
    expect(r1.movedCount).toBeGreaterThanOrEqual(3);

    const dest = path.join(root, "users", DEFAULT_USER_ID, ".zug");
    expect(fs.readFileSync(path.join(dest, "PERSONA.md"), "utf-8")).toBe("P");
    expect(fs.readFileSync(path.join(dest, "sessions", "2026-01-01-s.md"), "utf-8")).toBe("S");
    expect(fs.existsSync(path.join(dest, ".migrated"))).toBe(true);

    // control files remained flat, not migrated
    expect(fs.existsSync(path.join(flat, "config"))).toBe(true);
    expect(fs.existsSync(path.join(flat, "sync-state.json"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "config"))).toBe(false);
    // moved content removed from flat
    expect(fs.existsSync(path.join(flat, "PERSONA.md"))).toBe(false);

    const r2 = migrateLegacyData();
    expect(r2.migrated).toBe(false);
    expect(r2.movedCount).toBe(0);
  });

  it("does nothing on a fresh install (no legacy content)", () => {
    expect(migrateLegacyData().migrated).toBe(false);
  });
});
