import {
  addObservations, addGrowth, addSessionFile, getAllReinforcements, writeReinforcements,
  readLessons, writeLessons, writePersonaAtomic, writePlaybookAtomic, writeActiveAtomic,
  getObservationsForSync, getGrowthSince, getAllSessionFiles, writeSynthesisStatus,
} from "./storage.js";
import { mergeReinforcements, mergeLessons } from "./merge-core.js";
import { resolveSyncConfig, readSyncState, writeSyncState, getSourceId } from "./sync-state.js";
import type { PullResponse, SyncPayload } from "./sync-types.js";

export interface SyncResult { status: "ok" | "paused" | "skipped"; error?: string; }

/**
 * Advance a sync cursor to the latest timestamp actually seen among the cursor-gated append
 * logs (observations + growth), never regressing below the current cursor.
 *
 * We deliberately use max(entry timestamp) rather than the server's wall-clock `highWater`
 * (ISS-043): the server gates what it sends with `new Date(timestamp).getTime() > since`,
 * so advancing the cursor to a server now() that leads the entries' own timestamps — under
 * client/server clock skew, or when a back-dated entry surfaces after another machine's pull
 * stamped highWater — can push the cursor past an entry the server still needs to send,
 * permanently skipping it (dedup can't recover what is never sent). Anchoring the cursor to
 * the newest entry we actually processed closes that window: any entry the server has not yet
 * surfaced necessarily has a timestamp >= our cursor and remains eligible next exchange.
 * Comparison is numeric to stay robust to ISO formatting differences and consistent with the
 * server's filter.
 */
function advanceCursor(current: string, entries: Array<{ timestamp: string }>): string {
  let best = current;
  let bestMs = new Date(current).getTime();
  if (Number.isNaN(bestMs)) bestMs = 0;
  for (const e of entries) {
    const ms = new Date(e.timestamp).getTime();
    if (!Number.isNaN(ms) && ms > bestMs) { bestMs = ms; best = e.timestamp; }
  }
  return best;
}

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
    // Projected down, not merged (ISS-049). Guarded because an older server does not send the field.
    if (data.synthesisStatus) writeSynthesisStatus(data.synthesisStatus);

    const pullSince = advanceCursor(state.pullSince, [...data.observations, ...data.growth]);
    writeSyncState({ ...state, pullSince, lastSyncedAt: new Date().toISOString(), status: "ok", lastError: undefined });
    return { status: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeSyncState({ ...state, status: "paused", lastError: msg });
    return { status: "paused", error: msg };
  }
}

export async function push(opts: { timeoutMs?: number } = {}): Promise<SyncResult> {
  const cfg = resolveSyncConfig();
  if (!cfg) return { status: "skipped" };
  const state = readSyncState();
  const sinceDay = state.pushSince.slice(0, 10);
  const payload: SyncPayload = {
    sourceId: getSourceId(),
    observations: getObservationsForSync(state.pushSince),
    sessions: getAllSessionFiles().filter((s) => s.filename.slice(0, 10) >= sinceDay),
    growth: getGrowthSince(state.pushSince),
    reinforcements: getAllReinforcements(),
    lessons: readLessons(),
  };
  try {
    // Server returns a highWater, but we intentionally do not use it for the cursor — see
    // advanceCursor / ISS-043. A 2xx (fetchJson throws on non-ok) confirms acceptance.
    await fetchJson(
      `${cfg.url}/sync/push`,
      { method: "POST", headers: { "X-Zug-Token": cfg.token, "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      opts.timeoutMs ?? 15000,
    );
    const pushSince = advanceCursor(state.pushSince, [...payload.observations, ...payload.growth]);
    writeSyncState({ ...state, pushSince, lastSyncedAt: new Date().toISOString(), status: "ok", lastError: undefined });
    return { status: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeSyncState({ ...state, status: "paused", lastError: msg });
    return { status: "paused", error: msg };
  }
}

export async function sync(opts: { timeoutMs?: number } = {}): Promise<{ push: SyncResult; pull: SyncResult }> {
  const pushed = await push(opts);
  const pulled = await pull(opts);
  return { push: pushed, pull: pulled };
}
