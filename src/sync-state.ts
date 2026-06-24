import fs from "fs";
import path from "path";
import crypto from "crypto";
// Function-level import only: these are called inside functions, never at module init, so the storage<->sync-state cycle is safe.
import { getDataDir, getPaths } from "./storage.js";

export type SyncMode = "canonical" | "synced" | "local-only";
export interface SyncConfig { url: string; token: string; }
export interface SyncState {
  sourceId: string; pullSince: string; pushSince: string;
  lastSyncedAt: string; status: "ok" | "paused"; lastError?: string;
}

const EPOCH = "1970-01-01T00:00:00.000Z";

// Tenancy-aware: source-id is namespaced per user because createLesson() tags server-side lesson
// IDs with it and runs inside a tenant scope (PR-1). Resolves to the flat dir absent a scope.
function sourceIdFile(): string { return path.join(getPaths().zugDir, "source-id"); }

export function getSourceId(): string {
  const file = sourceIdFile();
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf-8").trim();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const id = crypto.randomBytes(3).toString("hex");
  fs.writeFileSync(file, id, "utf-8");
  return id;
}

function readConfigFile(): Record<string, string> {
  const file = path.join(getDataDir(), "config");
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function resolveSyncConfig(): SyncConfig | null {
  const cfg = readConfigFile();
  const url = process.env.ZUG_SYNC_URL || process.env.ZUG_URL || cfg.ZUG_SYNC_URL || cfg.ZUG_URL;
  const token = process.env.ZUG_TOKEN || cfg.ZUG_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export function getSyncMode(): SyncMode {
  if (process.env.ZUG_CANONICAL === "1") return "canonical";
  return resolveSyncConfig() ? "synced" : "local-only";
}

function stateFile(): string { return path.join(getDataDir(), "sync-state.json"); }

export function readSyncState(): SyncState {
  const file = stateFile();
  const base: SyncState = { sourceId: getSourceId(), pullSince: EPOCH, pushSince: EPOCH, lastSyncedAt: EPOCH, status: "ok" };
  if (!fs.existsSync(file)) return base;
  try { return { ...base, ...JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<SyncState> }; }
  catch { return base; }
}

export function writeSyncState(s: SyncState): void {
  const file = stateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(s, null, 2), "utf-8");
}
