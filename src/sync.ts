import {
  addObservations, addGrowth, addSessionFile, getAllReinforcements, writeReinforcements,
  readLessons, writeLessons, writePersonaAtomic, writePlaybookAtomic, writeActiveAtomic,
} from "./storage.js";
import { mergeReinforcements, mergeLessons } from "./merge-core.js";
import { resolveSyncConfig, readSyncState, writeSyncState } from "./sync-state.js";
import type { PullResponse } from "./sync-types.js";

export interface SyncResult { status: "ok" | "paused" | "skipped"; error?: string; }

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

export async function pull(opts: { timeoutMs?: number } = {}): Promise<SyncResult> {
  const cfg = resolveSyncConfig();
  if (!cfg) return { status: "skipped" };
  const state = readSyncState();
  try {
    const data = await fetchJson(
      `${cfg.url}/sync/pull?since=${encodeURIComponent(state.pullSince)}`,
      { method: "GET", headers: { "X-Zug-Token": cfg.token } },
      opts.timeoutMs ?? 3000,
    ) as PullResponse;

    addObservations(data.observations);
    addGrowth(data.growth);
    for (const s of data.sessions) addSessionFile(s.filename, s.content);
    if (data.reinforcements.length) writeReinforcements(mergeReinforcements(getAllReinforcements(), data.reinforcements));
    if (data.lessons.length) writeLessons(mergeLessons(readLessons(), data.lessons));
    if (data.persona) writePersonaAtomic(data.persona);
    if (data.playbook) writePlaybookAtomic(data.playbook);
    if (data.active) writeActiveAtomic(data.active);

    writeSyncState({ ...state, pullSince: data.highWater, lastSyncedAt: new Date().toISOString(), status: "ok", lastError: undefined });
    return { status: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeSyncState({ ...state, status: "paused", lastError: msg });
    return { status: "paused", error: msg };
  }
}
