import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getSourceId, resolveSyncConfig, getSyncMode, readSyncState, writeSyncState } from "./sync-state.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-"));
  process.env.ZUG_DATA_DIR = dir;
  delete process.env.ZUG_CANONICAL;
  delete process.env.ZUG_URL;
  delete process.env.ZUG_SYNC_URL;
  delete process.env.ZUG_TOKEN;
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("getSourceId", () => {
  it("is stable across calls and 6 hex chars", () => {
    const a = getSourceId();
    expect(a).toMatch(/^[a-z0-9]{6}$/);
    expect(getSourceId()).toBe(a);
  });
});

describe("getSyncMode", () => {
  it("is canonical when ZUG_CANONICAL=1", () => {
    process.env.ZUG_CANONICAL = "1";
    expect(getSyncMode()).toBe("canonical");
  });
  it("is local-only with no sync config", () => {
    expect(getSyncMode()).toBe("local-only");
  });
  it("is synced when url+token present in env", () => {
    process.env.ZUG_URL = "https://zug-mcp.fly.dev";
    process.env.ZUG_TOKEN = "secret";
    expect(getSyncMode()).toBe("synced");
    expect(resolveSyncConfig()).toEqual({ url: "https://zug-mcp.fly.dev", token: "secret" });
  });

  it("prefers ZUG_SYNC_URL over ZUG_URL", () => {
    process.env.ZUG_SYNC_URL = "https://sync.example";
    process.env.ZUG_URL = "https://other.example";
    process.env.ZUG_TOKEN = "t";
    expect(resolveSyncConfig()).toEqual({ url: "https://sync.example", token: "t" });
  });

  it("resolves config from <dataDir>/config when env is absent", () => {
    fs.writeFileSync(path.join(dir, "config"), "ZUG_URL=https://from-file.example/\nZUG_TOKEN=filetok\n", "utf-8");
    expect(getSyncMode()).toBe("synced");
    expect(resolveSyncConfig()).toEqual({ url: "https://from-file.example", token: "filetok" });
  });
});

describe("sync state round-trip", () => {
  it("writes and reads sync-state.json with defaults", () => {
    const s = readSyncState();
    expect(s.status).toBe("ok");
    s.pullSince = "2026-05-28T00:00:00Z";
    writeSyncState(s);
    expect(readSyncState().pullSince).toBe("2026-05-28T00:00:00Z");
  });
});
