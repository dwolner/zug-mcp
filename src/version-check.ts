import fs from "fs";
import path from "path";
import { getDataDir } from "./storage.js";

const REGISTRY_URL = "https://registry.npmjs.org/zug-mcp/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;

interface UpdateCache {
  checkedAt: string;
  latestVersion: string;
}

function cacheFile(): string {
  return path.join(getDataDir(), "update-check.json");
}

function readCache(): UpdateCache | null {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(), "utf-8")) as UpdateCache;
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  try {
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(cacheFile(), JSON.stringify(cache));
  } catch {
    // best-effort; a failed cache write should never break a command
  }
}

function isStale(cache: UpdateCache | null): boolean {
  if (!cache) return true;
  return Date.now() - Date.parse(cache.checkedAt) > CHECK_INTERVAL_MS;
}

async function fetchLatestVersion(): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** True if `a` is a newer plain "x.y.z" release than `b` (numeric per-segment compare). */
function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * Returns the latest published zug-mcp version if newer than currentVersion, else null.
 * Checks a once-a-day on-disk cache first so most invocations do no network I/O. Never
 * throws — offline/timeout/registry failures resolve to null so a command's output is
 * never blocked or broken by this check.
 */
export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  let cache = readCache();
  if (isStale(cache)) {
    const latestVersion = await fetchLatestVersion();
    if (latestVersion) {
      cache = { checkedAt: new Date().toISOString(), latestVersion };
      writeCache(cache);
    } else if (!cache) {
      return null;
    }
  }
  return cache && isNewer(cache.latestVersion, currentVersion) ? cache.latestVersion : null;
}

export function updateNoticeLine(currentVersion: string, latestVersion: string): string {
  return `Update available: ${currentVersion} → ${latestVersion} — run \`zug update\``;
}
