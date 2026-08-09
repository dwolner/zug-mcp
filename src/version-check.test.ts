import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { checkForUpdate, updateNoticeLine } from "./version-check.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-"));
  process.env.ZUG_DATA_DIR = dir;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  delete process.env.ZUG_DATA_DIR;
});

const stubRegistry = (version: string) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("checkForUpdate", () => {
  it("returns the latest version when the registry reports a newer version", async () => {
    stubRegistry("1.3.0");
    const result = await checkForUpdate("1.2.0");
    expect(result).toBe("1.3.0");
  });

  it("returns null when the running version is already current", async () => {
    stubRegistry("1.2.0");
    const result = await checkForUpdate("1.2.0");
    expect(result).toBeNull();
  });

  it("compares versions numerically, not lexicographically", async () => {
    // "1.9.0" > "1.10.0" as strings, but 1.10.0 is the newer release.
    stubRegistry("1.9.0");
    const result = await checkForUpdate("1.10.0");
    expect(result).toBeNull();
  });

  it("returns null without throwing when the registry is unreachable and there is no cache", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    const result = await checkForUpdate("1.2.0");
    expect(result).toBeNull();
  });

  it("does not hit the network again when the cache is fresh", async () => {
    const fetchMock = stubRegistry("1.3.0");
    await checkForUpdate("1.2.0");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await checkForUpdate("1.2.0");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hits the network again once the cache is stale", async () => {
    const fetchMock = stubRegistry("1.3.0");
    await checkForUpdate("1.2.0");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cacheFile = path.join(dir, "update-check.json");
    const cache = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
    cache.checkedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(cacheFile, JSON.stringify(cache));

    await checkForUpdate("1.2.0");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("updateNoticeLine", () => {
  it("includes both versions and the update command", () => {
    const line = updateNoticeLine("1.2.0", "1.3.0");
    expect(line).toContain("1.2.0");
    expect(line).toContain("1.3.0");
    expect(line).toContain("zug update");
  });
});
