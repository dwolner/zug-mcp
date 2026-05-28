# Local-first Single-User Sync Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Zug CLI/desktop local-first with background sync to the canonical Fly server, so a server outage degrades to "sync paused" instead of total failure, and one authoritative persona follows the user across machines.

**Architecture:** The Fly server is canonical: it holds the merged append-only logs and runs synthesis. fs clients read/write local files (hot path) and sync in the background — push raw log entries, pull the server's merged log + authoritative `PERSONA/PLAYBOOK/ACTIVE`. Sync is hook-backed on Claude Code (`SessionStart`→pull, `SessionEnd`/`PreCompact`→push) with the MCP gate tools as a secondary trigger. A client is `synced` (sync URL+token configured), `local-only` (no config — today's behavior), or `canonical` (`ZUG_CANONICAL=1`, the server).

**Tech Stack:** TypeScript (ES2022, ESM), Node 20+, Express, `@modelcontextprotocol/sdk`, Zod, Vitest. Reference spec: `docs/superpowers/specs/2026-05-28-local-first-single-user-sync-design.md`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/merge-core.ts` (new) | Pure merge functions for every artifact (observations, sessions, growth, reinforcements, lessons). Single source of truth for merge, shared by the CLI importer and the server sync handlers. |
| `src/sync-state.ts` (new) | Client sync state: stable `sourceId`, `~/.zug/sync-state.json` read/write, sync config resolution, `getSyncMode()`. |
| `src/sync.ts` (new) | Client sync engine: `pull()`, `push()`, `sync()` over `fetch`, non-throwing degradation. |
| `src/sync-server.ts` (new) | Server-side `handleSyncPull(since)` and `handleSyncPush(payload)` — merge + (push) trigger synthesis. Unit-testable without Express. |
| `src/storage.ts` (modify) | Source-safe lesson id minting; observation live+archive readers; growth/reinforcement getters+writers; atomic projection writes. |
| `src/merge.ts` (modify) | Use `merge-core` functions instead of inline union logic. |
| `src/server.ts` (modify) | Gate-tool mode branch (`zug_get_context` pull, `zug_end_session` push/skip-synth); relax lesson-id regex. |
| `src/http.ts` (modify) | Thin Express routes for `/sync/pull` + `/sync/push`. |
| `src/cli.ts` (modify) | `zug sync` / `zug pull` / `zug push` verbs. |
| `src/setup.ts` (modify) | Register `SessionStart`(`startup`+`compact`), `SessionEnd`, `PreCompact`(push) hooks. |
| `fly.toml` (modify) | `ZUG_CANONICAL=1`; document `ANTHROPIC_API_KEY` secret + always-on. |

### Shared type signatures (defined once, used across tasks)

```ts
// merge-core.ts
import type { Observation, GrowthSnapshot, ReinforcedPattern, Lesson } from "./storage.js";
export interface SessionFile { filename: string; content: string; }
export function mergeObservations(base: Observation[], incoming: Observation[]): Observation[];
export function mergeSessions(base: SessionFile[], incoming: SessionFile[]): SessionFile[];
export function mergeGrowth(base: GrowthSnapshot[], incoming: GrowthSnapshot[]): GrowthSnapshot[];
export function mergeReinforcements(base: ReinforcedPattern[], incoming: ReinforcedPattern[]): ReinforcedPattern[];
export function mergeLessons(base: Lesson[], incoming: Lesson[]): Lesson[];

// sync-state.ts
export type SyncMode = "canonical" | "synced" | "local-only";
export interface SyncConfig { url: string; token: string; }
export interface SyncState { sourceId: string; pullSince: string; pushSince: string; lastSyncedAt: string; status: "ok" | "paused"; lastError?: string; }
export function getSourceId(): string;                       // stable 6-hex per install
export function resolveSyncConfig(): SyncConfig | null;      // env or ~/.zug/config
export function getSyncMode(): SyncMode;
export function readSyncState(): SyncState;
export function writeSyncState(s: SyncState): void;

// sync.ts  &  sync-server.ts share this wire shape
export interface SyncPayload {
  sourceId: string;
  observations: Observation[];
  sessions: SessionFile[];
  growth: GrowthSnapshot[];
  reinforcements: ReinforcedPattern[];
  lessons: Lesson[];
}
export interface PullResponse extends SyncPayload {
  persona: string; playbook: string; active: string; highWater: string;
}
export interface PushResult { accepted: Record<string, number>; highWater: string; }
```

**Test convention:** every filesystem test sets `process.env.ZUG_DATA_DIR` to a fresh `fs.mkdtempSync(path.join(os.tmpdir(), "zug-"))` in `beforeEach` and restores/removes in `afterEach`. `getDataDir()` reads the env var at call time, so this fully isolates each test.

**Run commands:** single file `pnpm vitest run src/<file>.test.ts`; single test `pnpm vitest run src/<file>.test.ts -t "<name>"`; full suite `pnpm test`; typecheck `pnpm typecheck`.

---

## Task 1: Extract `merge-core.ts` (pure merge functions)

**Files:**
- Create: `src/merge-core.ts`
- Create: `src/merge-core.test.ts`
- Modify: `src/storage.ts` (export `normalizeText`)
- Modify: `src/merge.ts:34-96` (use `mergeObservations` / `mergeSessions`)

- [ ] **Step 1: Export `normalizeText` from storage.ts**

In `src/storage.ts`, change the private helper (currently `function normalizeText`) to exported:

```ts
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 2: Write the failing test**

Create `src/merge-core.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeObservations, mergeSessions, mergeGrowth, mergeReinforcements, mergeLessons } from "./merge-core.js";
import type { Observation, GrowthSnapshot, ReinforcedPattern, Lesson } from "./storage.js";

const obs = (ts: string, text: string): Observation => ({
  timestamp: ts, type: "context", observation: text, session_id: "s", confidence: "high",
});

describe("mergeObservations", () => {
  it("unions, dedupes by timestamp|observation, sorts by timestamp", () => {
    const base = [obs("2026-01-02T00:00:00Z", "b")];
    const incoming = [obs("2026-01-01T00:00:00Z", "a"), obs("2026-01-02T00:00:00Z", "b")];
    const out = mergeObservations(base, incoming);
    expect(out.map((o) => o.observation)).toEqual(["a", "b"]);
  });
});

describe("mergeSessions", () => {
  it("unions by filename, keeps base on conflict", () => {
    const out = mergeSessions(
      [{ filename: "x.md", content: "BASE" }],
      [{ filename: "x.md", content: "OTHER" }, { filename: "y.md", content: "NEW" }],
    );
    expect(out.find((s) => s.filename === "x.md")!.content).toBe("BASE");
    expect(out.map((s) => s.filename).sort()).toEqual(["x.md", "y.md"]);
  });
});

describe("mergeGrowth", () => {
  it("dedupes by timestamp|sessionId", () => {
    const g = (ts: string, sid: string): GrowthSnapshot => ({
      timestamp: ts, sessionId: sid, sessionCount: 1, observationCount: 1, personaLines: 1,
      topPatterns: [], activePatternCount: 0, lessonCount: 0,
    });
    const out = mergeGrowth([g("t1", "a")], [g("t1", "a"), g("t2", "b")]);
    expect(out).toHaveLength(2);
  });
});

describe("mergeReinforcements", () => {
  it("keys by normalized text, keeps max count and latest lastSeen", () => {
    const base: ReinforcedPattern[] = [{ text: "Likes tabs.", count: 2, lastSeen: "2026-01-01T00:00:00Z" }];
    const incoming: ReinforcedPattern[] = [{ text: "likes tabs", count: 5, lastSeen: "2026-02-01T00:00:00Z" }];
    const out = mergeReinforcements(base, incoming);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(5);
    expect(out[0].lastSeen).toBe("2026-02-01T00:00:00Z");
  });
});

describe("mergeLessons", () => {
  const lesson = (id: string, lastReinforced: string, title = "t"): Lesson => ({
    id, title, content: "c", context: "x", source: "manual", tags: [], status: "active",
    createdAt: "2026-01-01T00:00:00Z", lastReinforced, reinforcementCount: 0,
  });
  it("unions by id; on same id keeps latest lastReinforced", () => {
    const out = mergeLessons(
      [lesson("L-a-1", "2026-01-01T00:00:00Z", "old")],
      [lesson("L-a-1", "2026-02-01T00:00:00Z", "new"), lesson("L-b-1", "2026-01-01T00:00:00Z")],
    );
    expect(out).toHaveLength(2);
    expect(out.find((l) => l.id === "L-a-1")!.title).toBe("new");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/merge-core.test.ts`
Expected: FAIL — `Cannot find module './merge-core.js'`.

- [ ] **Step 4: Implement `merge-core.ts`**

Create `src/merge-core.ts`:

```ts
import { normalizeText, type Observation, type GrowthSnapshot, type ReinforcedPattern, type Lesson } from "./storage.js";

export interface SessionFile { filename: string; content: string; }

export function mergeObservations(base: Observation[], incoming: Observation[]): Observation[] {
  const key = (o: Observation) => `${o.timestamp}|${o.observation}`;
  const seen = new Map<string, Observation>();
  for (const o of [...base, ...incoming]) if (!seen.has(key(o))) seen.set(key(o), o);
  return [...seen.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function mergeSessions(base: SessionFile[], incoming: SessionFile[]): SessionFile[] {
  const byName = new Map<string, SessionFile>();
  for (const s of incoming) byName.set(s.filename, s);
  for (const s of base) byName.set(s.filename, s); // base wins on conflict
  return [...byName.values()];
}

export function mergeGrowth(base: GrowthSnapshot[], incoming: GrowthSnapshot[]): GrowthSnapshot[] {
  const key = (g: GrowthSnapshot) => `${g.timestamp}|${g.sessionId}`;
  const seen = new Map<string, GrowthSnapshot>();
  for (const g of [...base, ...incoming]) if (!seen.has(key(g))) seen.set(key(g), g);
  return [...seen.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function mergeReinforcements(base: ReinforcedPattern[], incoming: ReinforcedPattern[]): ReinforcedPattern[] {
  const byKey = new Map<string, ReinforcedPattern>();
  for (const p of [...base, ...incoming]) {
    const k = normalizeText(p.text);
    const cur = byKey.get(k);
    if (!cur) { byKey.set(k, { ...p }); continue; }
    byKey.set(k, {
      text: cur.lastSeen.localeCompare(p.lastSeen) >= 0 ? cur.text : p.text,
      count: Math.max(cur.count, p.count),
      lastSeen: cur.lastSeen.localeCompare(p.lastSeen) >= 0 ? cur.lastSeen : p.lastSeen,
    });
  }
  return [...byKey.values()];
}

export function mergeLessons(base: Lesson[], incoming: Lesson[]): Lesson[] {
  const byId = new Map<string, Lesson>();
  const wins = (a: Lesson, b: Lesson) => {
    const r = a.lastReinforced.localeCompare(b.lastReinforced);
    return (r !== 0 ? r : a.createdAt.localeCompare(b.createdAt)) >= 0 ? a : b;
  };
  for (const l of [...base, ...incoming]) {
    const cur = byId.get(l.id);
    byId.set(l.id, cur ? wins(cur, l) : l);
  }
  return [...byId.values()];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/merge-core.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Refactor `merge.ts` to use the shared functions**

In `src/merge.ts`, replace the inline observation dedup block (lines ~38-72) and session copy block (lines ~81-93) with calls into `merge-core`. Replace the observation section body with:

```ts
import { mergeObservations } from "./merge-core.js";
// ...
if (fs.existsSync(importObsFile)) {
  const parse = (file: string) =>
    fs.existsSync(file)
      ? fs.readFileSync(file, "utf-8").split("\n").filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } })
          .filter(Boolean)
      : [];
  const before = parse(localObsFile).length;
  const merged = mergeObservations(parse(localObsFile), parse(importObsFile));
  fs.writeFileSync(localObsFile, merged.map((o) => JSON.stringify(o)).join("\n") + "\n", "utf-8");
  console.log(`observations.jsonl: ${merged.length - before} new observations merged (${merged.length} total)`);
}
```

(Leave the session-copy and synthesis sections functionally equivalent; the goal is to reuse `mergeObservations`. The session copy already does a filename union — optionally route it through `mergeSessions`, but a no-behavior-change refactor is acceptable here.)

- [ ] **Step 7: Run the full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: PASS (no regressions).

- [ ] **Step 8: Commit**

```bash
git add src/merge-core.ts src/merge-core.test.ts src/storage.ts src/merge.ts
git commit -m "$(cat <<'EOF'
refactor: extract reusable artifact merge functions into merge-core (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Source-safe lesson ids

**Files:**
- Modify: `src/storage.ts` (`createLesson` minting; add `getSourceId` re-export note — actual `getSourceId` lives in `sync-state.ts`, Task 3, so define a local minimal version here and reconcile in Task 3)
- Modify: `src/server.ts:443,473,479,550` (relax regex)
- Modify: `src/storage.test.ts:536-547` (id assertions)

> **Ordering note:** `getSourceId()` formally belongs to `sync-state.ts` (Task 3). To keep this task self-contained, add a private `sourceTag()` helper in `storage.ts` now (reads/creates `~/.zug/source-id`); Task 3's `getSourceId()` will read the same file, so they agree.

- [ ] **Step 1: Write the failing test**

Replace the sequential-id test in `src/storage.test.ts` (the block asserting `L-001`/`L-002`) with:

```ts
it("mints source-safe ids of the form L-<tag>-<seq>", () => {
  const a = createLesson({ title: "A", content: "ca", context: "x", source: "manual", tags: [] });
  const b = createLesson({ title: "B", content: "cb", context: "x", source: "manual", tags: [] });
  expect(a.id).toMatch(/^L-[a-z0-9]{6}-1$/);
  expect(b.id).toMatch(/^L-[a-z0-9]{6}-2$/);
  expect(a.id.slice(0, 9)).toBe(b.id.slice(0, 9)); // same source tag
});
```

Update the `getNextId`-style test (around line 543-547) that pre-seeds `L-001`/`L-003` and expects `L-004`: change seeded ids to the new scheme and assert the next seq is `max+1` for that tag:

```ts
it("continues the per-source sequence from existing max", () => {
  // seed two lessons via createLesson, then assert the third is seq 3
  createLesson({ title: "A", content: "c", context: "x", source: "manual", tags: [] });
  createLesson({ title: "B", content: "c", context: "x", source: "manual", tags: [] });
  const c = createLesson({ title: "C", content: "c", context: "x", source: "manual", tags: [] });
  expect(c.id).toMatch(/-3$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/storage.test.ts -t "source-safe"`
Expected: FAIL — current ids are `L-001`.

- [ ] **Step 3: Implement source-safe minting in `storage.ts`**

Add near the top of the lesson section:

```ts
import crypto from "crypto";

function sourceTag(): string {
  const { zugDir } = getPaths();
  const file = path.join(zugDir, "source-id");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf-8").trim();
  ensureDirs();
  const tag = crypto.randomBytes(3).toString("hex"); // 6 hex chars
  fs.writeFileSync(file, tag, "utf-8");
  return tag;
}
```

Replace the id-minting logic inside `createLesson`:

```ts
export function createLesson(
  data: Omit<Lesson, "id" | "createdAt" | "lastReinforced" | "reinforcementCount" | "status">
): Lesson {
  let created!: Lesson;
  const tag = sourceTag();
  mutateLessons((lessons) => {
    const maxSeq = lessons.reduce((max, l) => {
      const m = l.id.match(new RegExp(`^L-${tag}-(\\d+)$`));
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const id = `L-${tag}-${maxSeq + 1}`;
    const now = new Date().toISOString();
    created = { ...data, id, status: "active", createdAt: now, lastReinforced: now, reinforcementCount: 0 };
    return [...lessons, created];
  });
  return created;
}
```

- [ ] **Step 4: Relax the id regex in `server.ts`**

Replace all four `/^L-\d{3,}$/` occurrences (lines 443, 473, 479, 550) with `/^L-[a-z0-9-]+$/`. Use search/replace across the file:

```ts
// before: z.string().regex(/^L-\d{3,}$/)
// after:  z.string().regex(/^L-[a-z0-9-]+$/)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/storage.test.ts`
Expected: PASS (lesson tests green under new scheme).

- [ ] **Step 6: Typecheck + full suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/storage.ts src/server.ts src/storage.test.ts
git commit -m "$(cat <<'EOF'
feat: source-safe lesson ids (L-<tag>-<seq>) to make cross-machine merge collision-free (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Sync state, config, and mode detection

**Files:**
- Create: `src/sync-state.ts`
- Create: `src/sync-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/sync-state.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/sync-state.test.ts`
Expected: FAIL — `Cannot find module './sync-state.js'`.

- [ ] **Step 3: Implement `sync-state.ts`**

Create `src/sync-state.ts`:

```ts
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { getDataDir } from "./storage.js";

export type SyncMode = "canonical" | "synced" | "local-only";
export interface SyncConfig { url: string; token: string; }
export interface SyncState {
  sourceId: string; pullSince: string; pushSince: string;
  lastSyncedAt: string; status: "ok" | "paused"; lastError?: string;
}

const EPOCH = "1970-01-01T00:00:00.000Z";

function sourceIdFile(): string { return path.join(getDataDir(), "source-id"); }

export function getSourceId(): string {
  const file = sourceIdFile();
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf-8").trim();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const id = crypto.randomBytes(3).toString("hex");
  fs.writeFileSync(file, id, "utf-8");
  return id;
}

function readConfigFile(): Record<string, string> {
  const file = path.join(os.homedir(), ".zug", "config");
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
```

- [ ] **Step 4: Reconcile `storage.ts` `sourceTag()` with `getSourceId()`**

In `src/storage.ts`, make `sourceTag()` delegate so both read the same `source-id` file (avoid two implementations):

```ts
import { getSourceId } from "./sync-state.js";
function sourceTag(): string { return getSourceId(); }
```

(Delete the inline `crypto` version added in Task 2. `storage.ts` importing `sync-state.ts` which imports `getDataDir` from `storage.ts` is a function-level cycle — safe in ESM because `getSourceId` is only called at runtime, not at module load.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/sync-state.test.ts src/storage.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck`
Expected: clean.

```bash
git add src/sync-state.ts src/sync-state.test.ts src/storage.ts
git commit -m "$(cat <<'EOF'
feat: sync state, config resolution, and three-way mode detection (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Storage helpers for sync

**Files:**
- Modify: `src/storage.ts` (add readers/writers)
- Modify: `src/storage.test.ts` (add tests)

- [ ] **Step 1: Write the failing test**

Append to `src/storage.test.ts`:

```ts
import {
  getAllObservations, getObservationsForSync, getGrowthSince,
  getAllReinforcements, writeReinforcements, addObservations, addGrowth,
  writePersonaAtomic,
} from "./storage.js";

describe("sync storage helpers", () => {
  it("getAllObservations reads live + archive", () => {
    appendObservation({ timestamp: "2026-01-02T00:00:00Z", type: "context", observation: "live", session_id: "s", confidence: "high" });
    archiveObservations(); // moves live -> archive
    appendObservation({ timestamp: "2026-01-03T00:00:00Z", type: "context", observation: "newlive", session_id: "s", confidence: "high" });
    const all = getAllObservations().map((o) => o.observation).sort();
    expect(all).toEqual(["live", "newlive"]);
  });

  it("getObservationsForSync filters by timestamp across live+archive", () => {
    appendObservation({ timestamp: "2026-01-01T00:00:00Z", type: "context", observation: "old", session_id: "s", confidence: "high" });
    appendObservation({ timestamp: "2026-01-05T00:00:00Z", type: "context", observation: "new", session_id: "s", confidence: "high" });
    const out = getObservationsForSync("2026-01-02T00:00:00Z").map((o) => o.observation);
    expect(out).toEqual(["new"]);
  });

  it("addObservations appends only entries not already present", () => {
    appendObservation({ timestamp: "2026-01-01T00:00:00Z", type: "context", observation: "a", session_id: "s", confidence: "high" });
    const added = addObservations([
      { timestamp: "2026-01-01T00:00:00Z", type: "context", observation: "a", session_id: "s", confidence: "high" },
      { timestamp: "2026-01-02T00:00:00Z", type: "context", observation: "b", session_id: "s", confidence: "high" },
    ]);
    expect(added).toBe(1);
    expect(getAllObservations()).toHaveLength(2);
  });

  it("writePersonaAtomic writes via temp+rename", () => {
    writePersonaAtomic("HELLO");
    expect(readPersona()).toBe("HELLO");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/storage.test.ts -t "sync storage helpers"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement helpers in `storage.ts`**

Add:

```ts
function parseJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf-8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as T; } catch { return null; } })
    .filter((x): x is T => x !== null);
}

export function getAllObservations(): Observation[] {
  const { observationsFile, zugDir } = getPaths();
  const archive = path.join(zugDir, "observations.archive.jsonl");
  return [...parseJsonl<Observation>(observationsFile), ...parseJsonl<Observation>(archive)];
}

export function getObservationsForSync(sinceISO: string): Observation[] {
  const since = new Date(sinceISO).getTime();
  return getAllObservations().filter((o) => new Date(o.timestamp).getTime() > since);
}

/** Append observations whose timestamp|observation key is not already present. Returns count added. */
export function addObservations(incoming: Observation[]): number {
  ensureDirs();
  const { observationsFile } = getPaths();
  const seen = new Set(getAllObservations().map((o) => `${o.timestamp}|${o.observation}`));
  let added = 0;
  for (const o of incoming) {
    const k = `${o.timestamp}|${o.observation}`;
    if (seen.has(k)) continue;
    fs.appendFileSync(observationsFile, JSON.stringify(o) + "\n", "utf-8");
    seen.add(k); added++;
  }
  return added;
}

export function getGrowthSince(sinceISO: string): GrowthSnapshot[] {
  const since = new Date(sinceISO).getTime();
  return readGrowthSnapshots().filter((g) => new Date(g.timestamp).getTime() > since);
}

/** Append growth snapshots not already present (by timestamp|sessionId). Returns count added. */
export function addGrowth(incoming: GrowthSnapshot[]): number {
  const seen = new Set(readGrowthSnapshots().map((g) => `${g.timestamp}|${g.sessionId}`));
  let added = 0;
  for (const g of incoming) {
    if (seen.has(`${g.timestamp}|${g.sessionId}`)) continue;
    appendGrowthSnapshot(g); seen.add(`${g.timestamp}|${g.sessionId}`); added++;
  }
  return added;
}

export function getAllReinforcements(): ReinforcedPattern[] {
  const { reinforcementsFile } = getPaths();
  return parseJsonl<ReinforcedPattern>(reinforcementsFile);
}

export function writeReinforcements(patterns: ReinforcedPattern[]): void {
  ensureDirs();
  const { reinforcementsFile } = getPaths();
  fs.writeFileSync(reinforcementsFile, patterns.map((p) => JSON.stringify(p)).join("\n") + "\n", "utf-8");
}

function atomicWrite(file: string, content: string): void {
  ensureDirs();
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, file);
}
export function writePersonaAtomic(content: string): void { atomicWrite(getPaths().personaFile, content); }
export function writePlaybookAtomic(content: string): void { atomicWrite(getPaths().playbookFile, content); }
export function writeActiveAtomic(content: string): void { atomicWrite(getPaths().activeFile, content); }

/** Return all session files as {filename, content}, excluding the archive subdir. */
export function getAllSessionFiles(): { filename: string; content: string }[] {
  ensureDirs();
  const { sessionsDir } = getPaths();
  return fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".md"))
    .map((filename) => ({ filename, content: fs.readFileSync(path.join(sessionsDir, filename), "utf-8") }));
}

/** Write a session file by exact filename if absent. Returns true if written. */
export function addSessionFile(filename: string, content: string): boolean {
  ensureDirs();
  const { sessionsDir } = getPaths();
  const dest = path.join(sessionsDir, filename);
  if (fs.existsSync(dest)) return false;
  fs.writeFileSync(dest, content, "utf-8");
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/storage.test.ts -t "sync storage helpers"`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
git add src/storage.ts src/storage.test.ts
git commit -m "$(cat <<'EOF'
feat: storage helpers for sync — live+archive readers, idempotent adders, atomic projection writes (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Server sync handlers — `handleSyncPull`

**Files:**
- Create: `src/sync-server.ts`
- Create: `src/sync-server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/sync-server.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { handleSyncPull } from "./sync-server.js";
import { appendObservation, writePersona } from "./storage.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-")); process.env.ZUG_DATA_DIR = dir; });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("handleSyncPull", () => {
  it("returns observations since cursor plus projections and highWater", () => {
    appendObservation({ timestamp: "2026-01-01T00:00:00Z", type: "context", observation: "old", session_id: "s", confidence: "high" });
    appendObservation({ timestamp: "2026-05-01T00:00:00Z", type: "context", observation: "new", session_id: "s", confidence: "high" });
    writePersona("PERSONA-CANONICAL");
    const res = handleSyncPull("2026-02-01T00:00:00Z");
    expect(res.observations.map((o) => o.observation)).toEqual(["new"]);
    expect(res.persona).toBe("PERSONA-CANONICAL");
    expect(typeof res.highWater).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/sync-server.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `handleSyncPull` in `sync-server.ts`**

Create `src/sync-server.ts`:

```ts
import {
  getObservationsForSync, getGrowthSince, getAllReinforcements, readLessons,
  getAllSessionFiles, readPersona, readPlaybook, readActive,
} from "./storage.js";
import type { PullResponse } from "./sync-types.js";

export function handleSyncPull(sinceISO: string): PullResponse {
  const sinceDay = sinceISO.slice(0, 10);
  return {
    sourceId: "server",
    observations: getObservationsForSync(sinceISO),
    sessions: getAllSessionFiles().filter((s) => s.filename.slice(0, 10) >= sinceDay),
    growth: getGrowthSince(sinceISO),
    reinforcements: getAllReinforcements(),
    lessons: readLessons(),
    persona: readPersona(),
    playbook: readPlaybook(),
    active: readActive(),
    highWater: new Date().toISOString(),
  };
}
```

Create `src/sync-types.ts` (shared wire types — imported by both client and server, avoids a client↔server import edge):

```ts
import type { Observation, GrowthSnapshot, ReinforcedPattern, Lesson } from "./storage.js";
import type { SessionFile } from "./merge-core.js";

export interface SyncPayload {
  sourceId: string;
  observations: Observation[];
  sessions: SessionFile[];
  growth: GrowthSnapshot[];
  reinforcements: ReinforcedPattern[];
  lessons: Lesson[];
}
export interface PullResponse extends SyncPayload {
  persona: string; playbook: string; active: string; highWater: string;
}
export interface PushResult { accepted: Record<string, number>; highWater: string; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/sync-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync-server.ts src/sync-types.ts src/sync-server.test.ts
git commit -m "$(cat <<'EOF'
feat: server-side sync pull handler + shared wire types (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Server sync handlers — `handleSyncPush` (+ synthesis trigger)

**Files:**
- Modify: `src/sync-server.ts`
- Modify: `src/sync-server.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/sync-server.test.ts`:

```ts
import { handleSyncPush } from "./sync-server.js";
import { getAllObservations, readLessons } from "./storage.js";
import type { SyncPayload } from "./sync-types.js";

const emptyPayload = (over: Partial<SyncPayload>): SyncPayload => ({
  sourceId: "client-a", observations: [], sessions: [], growth: [], reinforcements: [], lessons: [], ...over,
});

describe("handleSyncPush", () => {
  it("merges incoming observations idempotently", async () => {
    const p = emptyPayload({ observations: [
      { timestamp: "2026-03-01T00:00:00Z", type: "context", observation: "pushed", session_id: "s", confidence: "low" },
    ]});
    const r1 = await handleSyncPush(p);
    expect(r1.accepted.observations).toBe(1);
    const r2 = await handleSyncPush(p); // re-push
    expect(r2.accepted.observations).toBe(0);
    expect(getAllObservations()).toHaveLength(1);
  });

  it("unions lessons by id without losing either side", async () => {
    const l = (id: string): SyncPayload["lessons"][number] => ({
      id, title: id, content: "c", context: "x", source: "manual", tags: [], status: "active",
      createdAt: "2026-01-01T00:00:00Z", lastReinforced: "2026-01-01T00:00:00Z", reinforcementCount: 0,
    });
    await handleSyncPush(emptyPayload({ lessons: [l("L-a-1")] }));
    await handleSyncPush(emptyPayload({ lessons: [l("L-b-1")] }));
    expect(readLessons().map((x) => x.id).sort()).toEqual(["L-a-1", "L-b-1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/sync-server.test.ts -t "handleSyncPush"`
Expected: FAIL — `handleSyncPush` not exported.

- [ ] **Step 3: Implement `handleSyncPush`**

Add to `src/sync-server.ts`:

```ts
import {
  addObservations, addGrowth, addSessionFile, getAllReinforcements, writeReinforcements,
  readLessons, writeLessons, getObservationsBySession, getTopPatterns,
  readPersona, readPlaybook, writePersonaAtomic, writePlaybookAtomic, writeActiveAtomic,
} from "./storage.js";
import { mergeReinforcements, mergeLessons } from "./merge-core.js";
import { synthesize } from "./synthesize.js";
import type { SyncPayload, PushResult } from "./sync-types.js";

export async function handleSyncPush(payload: SyncPayload): Promise<PushResult> {
  const obsAdded = addObservations(payload.observations);
  let sessAdded = 0;
  for (const s of payload.sessions) if (addSessionFile(s.filename, s.content)) sessAdded++;
  const growthAdded = addGrowth(payload.growth);

  if (payload.reinforcements.length) {
    writeReinforcements(mergeReinforcements(getAllReinforcements(), payload.reinforcements));
  }
  let lessonsBefore = 0;
  if (payload.lessons.length) {
    lessonsBefore = readLessons().length;
    writeLessons(mergeLessons(readLessons(), payload.lessons));
  }

  // Canonical synthesis over newly-pushed meaningful observations.
  const meaningful = payload.observations.filter((o) => o.confidence !== "low");
  if (obsAdded > 0 && meaningful.length > 0) {
    try {
      const result = await synthesize({
        currentPersona: readPersona(),
        currentPlaybook: readPlaybook(),
        sessionSummary: `Sync push from source ${payload.sourceId}: ${meaningful.length} new observation(s).`,
        observations: meaningful.map((o) => ({ type: o.type, observation: o.observation, confidence: o.confidence })),
        reinforcedPatterns: getTopPatterns(10),
      });
      if (result) {
        writePersonaAtomic(result.persona);
        writePlaybookAtomic(result.playbook);
        if (result.active) writeActiveAtomic(result.active);
      }
    } catch (err) {
      console.error("[zug] sync-push synthesis failed:", err instanceof Error ? err.message : err);
    }
  }

  return {
    accepted: {
      observations: obsAdded, sessions: sessAdded, growth: growthAdded,
      reinforcements: payload.reinforcements.length, lessons: Math.max(0, readLessons().length - lessonsBefore),
    },
    highWater: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Note: `synthesize()` returns `null` without `ANTHROPIC_API_KEY`, so tests run with no key — `low`-confidence test obs skip synthesis, and the lessons test sends no observations. No network call occurs.

Run: `pnpm vitest run src/sync-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync-server.ts src/sync-server.test.ts
git commit -m "$(cat <<'EOF'
feat: server-side sync push handler with canonical synthesis trigger (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire `/sync/pull` and `/sync/push` into Express

**Files:**
- Modify: `src/http.ts` (add routes after the `/mcp` block)

- [ ] **Step 1: Add the routes**

In `src/http.ts`, after the existing auth middleware block and before `app.all("/mcp", ...)`, add a JSON body parser and the two routes (reuse the same auth by registering it for `/sync` too):

```ts
import { handleSyncPull, handleSyncPush } from "./sync-server.js";

// Reuse the same auth + rate-limit posture as /mcp for /sync.
app.use("/sync", (req, res, next) => {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) { res.status(429).json({ error: "Too Many Requests" }); return; }
  next();
});
app.use("/sync", (req, res, next) => {
  if (req.headers.authorization) {
    if (!req.headers.authorization.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
    requireBearerAuth({ provider: zugOAuthProvider })(req, res, next);
    return;
  }
  if (ZUG_TOKEN) {
    const rawToken = req.headers["x-zug-token"];
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    const tokenBuf = Buffer.from(typeof token === "string" ? token : "");
    const expectedBuf = Buffer.from(ZUG_TOKEN);
    if (tokenBuf.length === expectedBuf.length && timingSafeEqual(tokenBuf, expectedBuf)) { next(); return; }
  }
  res.status(401).json({ error: "Unauthorized" });
});
app.use("/sync", express.json({ limit: "16mb" }));

app.get("/sync/pull", (req, res) => {
  const since = typeof req.query.since === "string" ? req.query.since : "1970-01-01T00:00:00.000Z";
  res.json(handleSyncPull(since));
});
app.post("/sync/push", async (req, res) => {
  try { res.json(await handleSyncPush(req.body)); }
  catch (err) { console.error("sync push error:", err); res.status(500).json({ error: "Internal Server Error" }); }
});
```

> The auth middleware duplicates the `/mcp` logic. If preferred, extract a shared `zugAuth(req,res,next)` function and mount it on both — a small refactor, not required for correctness.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Manual smoke (optional, local)**

```bash
ZUG_TOKEN=test ZUG_DATA_DIR=/tmp/zug-srv node dist/http.js &
curl -s -H "X-Zug-Token: test" "http://localhost:8080/sync/pull?since=1970-01-01T00:00:00Z" | head -c 200
kill %1
```
Expected: JSON object with `persona`/`highWater` keys (after `pnpm build`).

- [ ] **Step 4: Commit**

```bash
git add src/http.ts
git commit -m "$(cat <<'EOF'
feat: expose /sync/pull and /sync/push endpoints behind existing auth (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Client sync engine — `pull()`

**Files:**
- Create: `src/sync.ts`
- Create: `src/sync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/sync.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { pull } from "./sync.js";
import { getAllObservations, readPersona, readLessons } from "./storage.js";
import type { PullResponse } from "./sync-types.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-"));
  process.env.ZUG_DATA_DIR = dir;
  process.env.ZUG_URL = "https://example.test";
  process.env.ZUG_TOKEN = "tok";
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

const pullResponse = (over: Partial<PullResponse>): PullResponse => ({
  sourceId: "server", observations: [], sessions: [], growth: [], reinforcements: [], lessons: [],
  persona: "", playbook: "", active: "", highWater: "2026-05-28T00:00:00.000Z", ...over,
});

describe("pull", () => {
  it("merges server observations + overwrites persona + advances cursor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(pullResponse({
      observations: [{ timestamp: "2026-05-01T00:00:00Z", type: "context", observation: "from-server", session_id: "s", confidence: "high" }],
      persona: "SERVER-PERSONA",
      lessons: [{ id: "L-z-1", title: "t", content: "c", context: "x", source: "manual", tags: [], status: "active", createdAt: "2026-01-01T00:00:00Z", lastReinforced: "2026-01-01T00:00:00Z", reinforcementCount: 0 }],
    })), { status: 200 }))));
    const result = await pull();
    expect(result.status).toBe("ok");
    expect(getAllObservations().map((o) => o.observation)).toContain("from-server");
    expect(readPersona()).toBe("SERVER-PERSONA");
    expect(readLessons().map((l) => l.id)).toContain("L-z-1");
  });

  it("degrades to paused on network error without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const result = await pull();
    expect(result.status).toBe("paused");
    expect(result.error).toContain("ECONNREFUSED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/sync.test.ts -t "pull"`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `pull()` in `sync.ts`**

Create `src/sync.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/sync.test.ts -t "pull"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync.ts src/sync.test.ts
git commit -m "$(cat <<'EOF'
feat: client sync pull with timeout + graceful paused degradation (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Client sync engine — `push()` and `sync()`

**Files:**
- Modify: `src/sync.ts`
- Modify: `src/sync.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/sync.test.ts`:

```ts
import { push, sync } from "./sync.js";
import { appendObservation, writeSession } from "./storage.js";
import type { PushResult } from "./sync-types.js";

describe("push", () => {
  it("posts entries since cursor and advances pushSince", async () => {
    appendObservation({ timestamp: "2026-05-10T00:00:00Z", type: "context", observation: "local", session_id: "s", confidence: "high" });
    writeSession("s", "# Session s\nDate: 2026-05-10T00:00:00Z\n## Summary\nx");
    let captured: any = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ accepted: { observations: 1 }, highWater: "2026-05-11T00:00:00.000Z" } satisfies PushResult), { status: 200 });
    }));
    const result = await push();
    expect(result.status).toBe("ok");
    expect(captured.observations).toHaveLength(1);
    expect(captured.sourceId).toMatch(/^[a-z0-9]{6}$/);
  });

  it("degrades to paused on error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    expect((await push()).status).toBe("paused");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/sync.test.ts -t "push"`
Expected: FAIL — `push`/`sync` not exported.

- [ ] **Step 3: Implement `push()` and `sync()`**

Add to `src/sync.ts`:

```ts
import {
  getObservationsForSync, getGrowthSince, getAllSessionFiles, getAllReinforcements as getReinf, readLessons as getLessons,
} from "./storage.js";
import { getSourceId } from "./sync-state.js";
import type { SyncPayload, PushResult } from "./sync-types.js";

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
    reinforcements: getReinf(),
    lessons: getLessons(),
  };
  try {
    const result = await fetchJson(
      `${cfg.url}/sync/push`,
      { method: "POST", headers: { "X-Zug-Token": cfg.token, "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      opts.timeoutMs ?? 15000,
    ) as PushResult;
    writeSyncState({ ...state, pushSince: result.highWater, lastSyncedAt: new Date().toISOString(), status: "ok", lastError: undefined });
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/sync.test.ts`
Expected: PASS (pull + push + sync).

- [ ] **Step 5: Commit**

```bash
git add src/sync.ts src/sync.test.ts
git commit -m "$(cat <<'EOF'
feat: client sync push + sync (push-then-pull) (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Gate-tool integration in `server.ts`

**Files:**
- Modify: `src/server.ts` (`zug_get_context`, `zug_end_session`)
- Modify: `src/server.test.ts`

> **Behavior by mode:**
> - `zug_get_context`: `synced` client → blocking `pull()` (3s) before reading; `canonical`/`local-only` → unchanged.
> - `zug_end_session`: `synced` client → skip the local persona-append + local `synthesize()`, then fire-and-forget `push()`; `canonical` → synthesize inline (unchanged); `local-only` → unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/server.test.ts` (adapt imports/harness to the file's existing pattern for invoking tools; if it calls handlers directly, mirror that):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs"; import os from "os"; import path from "path";

describe("synced-mode gate behavior", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-"));
    process.env.ZUG_DATA_DIR = dir;
    process.env.ZUG_URL = "https://example.test"; process.env.ZUG_TOKEN = "tok";
    delete process.env.ZUG_CANONICAL;
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); delete process.env.ZUG_URL; delete process.env.ZUG_TOKEN; });

  it("zug_end_session does NOT write persona locally in synced mode (server owns synthesis)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ accepted: {}, highWater: "2026-05-28T00:00:00.000Z" }), { status: 200 })));
    const { runEndSession } = await import("./server.js");
    await runEndSession({ session_id: "2026-05-28-x", summary: "did things" });
    // In synced mode the local persona is left to the server; no local append.
    const personaPath = path.join(dir, "PERSONA.md");
    const persona = fs.existsSync(personaPath) ? fs.readFileSync(personaPath, "utf-8") : "";
    expect(persona).not.toContain("did things");
  });
});
```

> This test assumes `zug_end_session`'s body is extracted into an exported `runEndSession(args)` function (see Step 3) so it can be unit-tested without the MCP transport. If `server.test.ts` already exercises tools through a connected in-memory client, follow that harness instead and assert the same outcome.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server.test.ts -t "synced-mode"`
Expected: FAIL — `runEndSession` not exported / persona still appended.

- [ ] **Step 3: Refactor and branch the gate tools**

In `src/server.ts`:

1. Add imports:
```ts
import { getSyncMode } from "./sync-state.js";
import { pull as syncPull, push as syncPush } from "./sync.js";
```

2. Extract the `zug_get_context` body into an exported `runGetContext({ delta })` and call it from the tool. At the top of the non-delta and delta paths, add a synced pre-pull:
```ts
export async function runGetContext({ delta }: { delta?: boolean }) {
  if (getSyncMode() === "synced") {
    await syncPull({ timeoutMs: 3000 }); // never throws; sets paused on failure
  }
  syncRulesContext();
  // ... existing delta / full body unchanged ...
}
```

3. Extract the `zug_end_session` body into an exported `runEndSession(args)`. Guard the local persona-append + local synthesis so they run **only when not synced**, and push when synced:
```ts
export async function runEndSession(args: { session_id: string; summary: string; context?: string; decisions?: string[]; blockers?: string[]; next_steps?: string[]; }) {
  const mode = getSyncMode();
  // ... existing: build sessionLines, writeSession, writeOpenThread(null), archiveSessions() ...

  if (mode !== "synced") {
    // existing synchronous persona append (meaningful observations) ...
    // existing background synthesize().then(...) block ...
  }

  // ... existing growth snapshot + return-text assembly ...

  if (mode === "synced") {
    void syncPush().catch(() => { /* paused state already recorded */ });
  }
  return /* existing result object */;
}
```

4. Point the two `server.tool(...)` registrations at `runGetContext` / `runEndSession`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server.test.ts`
Expected: PASS (existing local-mode tests still green; new synced-mode test green).

- [ ] **Step 5: Typecheck + commit**

```bash
git add src/server.ts src/server.test.ts
git commit -m "$(cat <<'EOF'
feat: synced-mode gate tools — pull on get_context, push + skip local synth on end_session (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: CLI verbs `zug sync` / `zug pull` / `zug push`

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add the command handlers and switch cases**

In `src/cli.ts`, add:

```ts
import { sync as runSync, pull as runPull, push as runPush } from "./sync.js";
import { getSyncMode } from "./sync-state.js";

async function cmdSync(kind: "sync" | "pull" | "push"): Promise<void> {
  if (getSyncMode() === "local-only") {
    console.log("Sync is not configured (local-only mode). Set ZUG_URL and ZUG_TOKEN in ~/.zug/config to enable.");
    return;
  }
  const fn = kind === "pull" ? runPull : kind === "push" ? runPush : runSync;
  const result = await fn();
  console.log(`zug ${kind}: ${JSON.stringify(result)}`);
}
```

Add switch cases (and usage lines):

```ts
case "sync": cmdSync("sync").then(() => process.exit(0)); break;
case "pull": cmdSync("pull").then(() => process.exit(0)); break;
case "push": cmdSync("push").then(() => process.exit(0)); break;
```

In `printUsage()` add:
```
  zug sync            Push local changes then pull canonical state (if sync configured)
  zug pull            Pull canonical state from the server
  zug push            Push local changes to the server
```

- [ ] **Step 2: Build + manual smoke**

Run: `pnpm build && node dist/cli.js push`
Expected (no sync config): prints the "Sync is not configured (local-only mode)" message and exits 0.

- [ ] **Step 3: Typecheck + commit**

```bash
git add src/cli.ts
git commit -m "$(cat <<'EOF'
feat: zug sync/pull/push CLI verbs (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Hook registration in `setup.ts`

**Files:**
- Modify: `src/setup.ts` (`mergeClaudeHooks`, and the `cmdCompact` push — but `cmdCompact` lives in `cli.ts`)
- Modify: `src/setup.test.ts`
- Modify: `src/cli.ts` (`cmdCompact` and `cmdResume` perform a sync side-effect)

> Hook facts (verified against the Claude Code hooks docs, 2026-05-28):
> - `SessionStart` matchers: `startup`, `resume`, `clear`, `compact`. Only `SessionStart` stdout is injected into context.
> - `SessionEnd` fires once at session termination (vs `Stop`, per-turn).
> - `PreCompact` / `SessionEnd` stdout is NOT injected — they are side-effect (push) hooks.

- [ ] **Step 1: Write the failing test**

In `src/setup.test.ts`, replace/extend the `mergeClaudeHooks` assertions to expect the new hook set:

```ts
it("registers SessionStart(startup+compact), SessionEnd, and PreCompact hooks", () => {
  const settingsPath = path.join(tmpHome, ".claude", "settings.json");
  mergeClaudeHooks(settingsPath, "/usr/local/bin/zug");
  const s = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  const cmds = (arr: any[] = []) => arr.flatMap((e) => e.hooks.map((h: any) => `${e.matcher}:${h.command}`));
  expect(cmds(s.hooks.SessionStart)).toEqual(expect.arrayContaining([
    "startup:/usr/local/bin/zug pull",
    "compact:/usr/local/bin/zug resume",
  ]));
  expect(cmds(s.hooks.SessionEnd).some((c: string) => c.endsWith("zug push"))).toBe(true);
  expect(cmds(s.hooks.PreCompact).some((c: string) => c.endsWith("zug compact"))).toBe(true);
});
```

(Use the test file's existing `tmpHome` setup; if absent, mkdtemp a home dir in `beforeEach`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/setup.test.ts -t "SessionStart"`
Expected: FAIL — current code only registers `compact:zug resume` + `PreCompact`.

- [ ] **Step 3: Update `mergeClaudeHooks` and the `ClaudeSettings` type**

Extend the interface and the function in `src/setup.ts`:

```ts
interface ClaudeSettings {
  hooks?: {
    PreCompact?: HookEntry[]; SessionStart?: HookEntry[]; SessionEnd?: HookEntry[];
    [k: string]: HookEntry[] | undefined;
  };
  [k: string]: unknown;
}

export function mergeClaudeHooks(settingsPath: string, zugBin: string): void {
  let settings: ClaudeSettings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as ClaudeSettings; } catch { /* fresh */ }
  if (!settings.hooks) settings.hooks = {};

  const dropZug = (arr: HookEntry[] = [], needle: string) =>
    arr.filter((h) => !h.hooks?.some((e) => e.command?.includes(needle)));

  // PreCompact -> push (durability checkpoint). stdout not injected; side effect only.
  settings.hooks.PreCompact = dropZug(settings.hooks.PreCompact, "zug compact");
  settings.hooks.PreCompact.push({ matcher: "", hooks: [{ type: "command", command: `${zugBin} compact` }] });

  // SessionStart: cold start (startup) pulls; compaction-resume (compact) reloads.
  settings.hooks.SessionStart = dropZug(dropZug(settings.hooks.SessionStart, "zug resume"), "zug pull");
  settings.hooks.SessionStart.push({ matcher: "startup", hooks: [{ type: "command", command: `${zugBin} pull` }] });
  settings.hooks.SessionStart.push({ matcher: "compact", hooks: [{ type: "command", command: `${zugBin} resume` }] });

  // SessionEnd: push once when the session terminates.
  settings.hooks.SessionEnd = dropZug(settings.hooks.SessionEnd, "zug push");
  settings.hooks.SessionEnd.push({ matcher: "", hooks: [{ type: "command", command: `${zugBin} push` }] });

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}
```

> Note: `SessionEnd` matchers are reason-scoped (`clear`/`resume`/`logout`/`prompt_input_exit`/`bypass_permissions_disabled`/`other`). An empty `matcher: ""` registers a catch-all entry; if the docs require an explicit reason list, register one entry per reason instead. Confirm empty-matcher behavior against the running client during the smoke test.

- [ ] **Step 4: Make `cmdCompact` and `cmdResume` perform the sync side-effect**

In `src/cli.ts`, the `zug compact`/`zug resume`/`zug pull` commands must do the actual sync work (the hooks call these). Update `cmdCompact` to push and `cmdResume` to pull, guarded by mode:

```ts
async function cmdCompact(): Promise<void> {
  if (getSyncMode() === "synced") { await runPush().catch(() => {}); }
  // ... existing checkpoint print (harmless; PreCompact stdout is ignored by the client) ...
}

async function cmdResume(): Promise<void> {
  if (getSyncMode() === "synced") { await runPull({ timeoutMs: 3000 }).catch(() => {}); }
  // ... existing resume print (SessionStart stdout IS injected) ...
}
```

Update the `case "compact"` / `case "resume"` switch arms to `await` and `process.exit(0)` like the other async commands.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/setup.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
git add src/setup.ts src/setup.test.ts src/cli.ts
git commit -m "$(cat <<'EOF'
feat: hook-backed sync — SessionStart(startup/compact), SessionEnd push, PreCompact push (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Canonical server config (`fly.toml`)

**Files:**
- Modify: `fly.toml`

- [ ] **Step 1: Mark the server canonical and (re-)affirm always-on**

In `fly.toml`, add `ZUG_CANONICAL` to `[env]` and ensure always-on (this overlaps T-042; if T-042 already landed, only the env var is new):

```toml
[env]
  PORT = '8080'
  ZUG_DATA_DIR = '/data/.zug'
  ZUG_CANONICAL = '1'

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = 'off'
  auto_start_machines = true
  min_machines_running = 1
```

- [ ] **Step 2: Document the required secret (no secret committed)**

`ANTHROPIC_API_KEY` enables canonical synthesis and must be set as a Fly secret, not in `fly.toml`:

```bash
fly secrets set ANTHROPIC_API_KEY=sk-ant-... -a zug-mcp
# ZUG_TOKEN must already be set as a secret for auth.
```

- [ ] **Step 3: Commit**

```bash
git add fly.toml
git commit -m "$(cat <<'EOF'
chore: mark Fly server canonical (ZUG_CANONICAL) and always-on for sync (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Integration test — convergence + offline degradation

**Files:**
- Create: `src/sync-integration.test.ts`

- [ ] **Step 1: Write the test**

Create `src/sync-integration.test.ts`. It drives the server handlers directly (no HTTP) by swapping `ZUG_DATA_DIR` between a "server" dir and two "client" dirs, simulating push/pull through `handleSyncPush`/`handleSyncPull`.

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs"; import os from "os"; import path from "path";
import { handleSyncPush, handleSyncPull } from "./sync-server.js";
import {
  appendObservation, getAllObservations, getObservationsForSync, getAllSessionFiles,
  getGrowthSince, getAllReinforcements, readLessons, addObservations, addSessionFile,
} from "./storage.js";
import type { SyncPayload } from "./sync-types.js";

function mkdir() { return fs.mkdtempSync(path.join(os.tmpdir(), "zug-")); }
function use(dir: string) { process.env.ZUG_DATA_DIR = dir; }

const since = "1970-01-01T00:00:00.000Z";
const payloadFrom = (sourceId: string): SyncPayload => ({
  sourceId,
  observations: getObservationsForSync(since),
  sessions: getAllSessionFiles(),
  growth: getGrowthSince(since),
  reinforcements: getAllReinforcements(),
  lessons: readLessons(),
});

describe("two clients converge through the canonical server", () => {
  let server: string, a: string, b: string;
  beforeEach(() => { server = mkdir(); a = mkdir(); b = mkdir(); });
  afterEach(() => { for (const d of [server, a, b]) fs.rmSync(d, { recursive: true, force: true }); });

  it("an observation made on A appears on B after sync", async () => {
    // A records locally
    use(a);
    appendObservation({ timestamp: "2026-05-01T00:00:00Z", type: "context", observation: "from-A", session_id: "sa", confidence: "low" });
    const aPayload = payloadFrom("a");

    // A pushes to server
    use(server);
    await handleSyncPush(aPayload);
    expect(getAllObservations().map((o) => o.observation)).toContain("from-A");

    // B pulls from server
    const pull = handleSyncPull(since);
    use(b);
    addObservations(pull.observations);
    for (const s of pull.sessions) addSessionFile(s.filename, s.content);
    expect(getAllObservations().map((o) => o.observation)).toContain("from-A");
  });
});

describe("offline degradation", () => {
  it("recording works locally with no server, and reconciles on next push", async () => {
    const a = mkdir(); const server = mkdir();
    use(a);
    appendObservation({ timestamp: "2026-05-02T00:00:00Z", type: "context", observation: "offline-note", session_id: "s", confidence: "low" });
    // (no server interaction here — simulating outage; local data intact)
    expect(getAllObservations()).toHaveLength(1);
    // reconnect: push to server
    const p = payloadFrom("a");
    use(server);
    await handleSyncPush(p);
    expect(getAllObservations().map((o) => o.observation)).toContain("offline-note");
    fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(server, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run src/sync-integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Full suite + typecheck + build**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all green; `dist/` builds.

- [ ] **Step 4: Add new dist files to package `files` (publish)**

In `package.json` `files`, add the new compiled modules so they ship:
```
"dist/merge-core.js", "dist/sync.js", "dist/sync-state.js", "dist/sync-server.js", "dist/sync-types.js",
```

- [ ] **Step 5: Commit**

```bash
git add src/sync-integration.test.ts package.json
git commit -m "$(cat <<'EOF'
test: two-client convergence + offline degradation integration coverage (T-043)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Close out — ticket, issue, docs

**Files:** none (tracking only)

- [ ] **Step 1: Mark T-043 complete and resolve ISS-042**

ISS-042 (dead PreCompact print) is addressed: `PreCompact` is now a push hook and the checkpoint print is documented as side-effect-only. Resolve it and mark T-043 complete via the story tools (or CLI):
```
storybloq ticket update T-043 --status complete
storybloq issue update ISS-042 --status resolved
```

- [ ] **Step 2: Verify the full pipeline once more**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: green.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Mode switch (synced/local-only/canonical) → Task 3 (`getSyncMode`), Task 10 (gate branch), Task 13 (`ZUG_CANONICAL`). ✓
- Server-canonical synthesis → Task 6 (`handleSyncPush` synth), Task 10 (client skips local synth). ✓
- Blocking pull + bg push → Task 10 (`runGetContext` awaits pull 3s; `runEndSession` fire-and-forget push). ✓
- Sync protocol `/sync/push` + `/sync/pull`, cursor model → Tasks 5–9. ✓
- Per-artifact merge strategies → Task 1 (`merge-core`) + Task 4 (idempotent adders). ✓
- Observations live+archive → Task 4 (`getAllObservations`/`getObservationsForSync`). ✓
- Source-safe lesson ids → Task 2. ✓
- Hook-backed triggers (SessionStart startup+compact, SessionEnd, PreCompact push) → Task 12. ✓
- Graceful degradation → Task 8/9 (paused, non-throwing) + Task 14 (offline test). ✓
- Testing strategy (unit + integration) → Tasks 1–14. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every code step shows code, every test step shows assertions. ✓

**Type consistency:** `SyncPayload`/`PullResponse`/`PushResult` defined once in `sync-types.ts` (Task 5) and imported by client (Tasks 8–9) and server (Tasks 5–6). `SessionFile` defined in `merge-core.ts` (Task 1) and reused. `getSourceId()` single source in `sync-state.ts`, `storage.ts.sourceTag()` delegates to it (Task 3). Merge fn names (`mergeObservations`/`mergeSessions`/`mergeGrowth`/`mergeReinforcements`/`mergeLessons`) consistent across Tasks 1/6/8/9. ✓

**Known judgement calls (flagged for the executor):**
- `handleSyncPull` filters sessions by filename-date ≥ since-day (coarse but correct; server dedups by filename).
- `highWater = now()` with strict `> since` filtering: sub-ms boundary miss is negligible for a single user; client dedup keys make re-pulls safe.
- `runEndSession`/`runGetContext` extraction assumes `server.test.ts` can import them; if the existing harness drives tools through a connected client, adapt Task 10's test to that harness.
