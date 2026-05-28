# Design: Local-first single-user sync engine (T-043, slice 1 of ADR-004)

**Status:** Draft — pending review
**Date:** 2026-05-28
**Ticket:** T-043
**Implements:** ADR-004 (first slice only — see Scope)

## Problem

On 2026-05-27 a multi-hour session returned `Session not found` on *every* `zug_get_context` / `zug_end_session` call. Root cause: the Fly server scales to zero (`auto_stop_machines = stop`, `min_machines_running = 0`) and on cold restart loses its in-memory MCP session map, so the client's session id is unknown to the restarted server. The CLI had **no local fallback**, so a server blip became total failure — zero continuity, which is Zug's entire purpose.

Today every client (CLI, desktop, web) talks to exactly one transport: stdio → local `~/.zug` files, *or* http → the Fly server's `/data/.zug` files. There is no sync between environments. The only cross-machine merge is `merge.ts`, a manual file-path import that re-synthesizes locally. So "one unified persona across machines" does not actually exist yet.

### Two code realities that contradict ADR-004's assumptions

ADR-004 assumes "persona is a recomputable projection — regenerate from the merged append-only log." The code diverges:

1. **`observations.jsonl` is truncated after synthesis.** `zug_end_session` runs `synthesize()` then `archiveObservations()`, which moves `observations.jsonl` into `observations.archive.jsonl` and empties the live file. The durable log is therefore `live + archive` combined, not the live file alone.
2. **Not all "logs" are append-only.** `merge.ts` only unions `observations.jsonl` + `sessions/`. `reinforcements.jsonl` and `lessons.jsonl` are mutable sets rewritten in place; `growth.jsonl` is append-only but never merged at all.

Neither is fatal — synthesis is *incremental* (folds current persona + new observations), so it never needs full history at steady state, and the archive preserves history for from-scratch rebuilds. But the sync design must treat the durable log as `live + archive` and define a per-artifact merge strategy rather than assuming uniform append-union.

## Scope

**In scope — single-user sync engine:**
- Treat the Fly server as *the* canonical store for one user (which it effectively already is — single `/data/.zug`, no multi-tenancy).
- Make fs clients (CLI, desktop) local-first with hook-backed background sync to the canonical server.
- Server-side synthesis owns the one authoritative persona; clients pull it.
- Graceful degradation: server unreachable → record locally, reconcile later.

**Explicitly out of scope (later slices / follow-ups):**
- Free/paid tiering and the BYOK-local vs. server synthesis split (ADR-004 decisions 4–5). Here: a client is *synced* (server-canonical) or *local-only* (today's behavior); there is no paywall.
- Multi-tenant accounts and durable OAuth (ADR-003 rework).
- Free→paid bulk migration.
- Web offline (web is inherently online; unchanged).

The local-only mode below is deliberately the future free tier, pre-staged, so tiering becomes "who may configure sync," not a rewrite.

## Decisions (settled in brainstorming)

1. **Single-user engine first.** Defer tiering/accounts/billing.
2. **Server-canonical synthesis.** Clients push raw logs and pull the one authoritative `PERSONA/PLAYBOOK/ACTIVE`. Synced clients do not synthesize locally. Deterministic single persona; CLI behaves like web/desktop already do.
3. **Blocking pull on session start (short timeout + local fallback), background push on session end.** Plus a manual `zug sync`.
4. **Sync is hook-backed on Claude Code, with the MCP gate tools as a secondary trigger** (and the only trigger on Cursor/Windsurf, which have no hooks). Hooks are the forcing function; tool calls are opportunistic.
5. **Compaction is a durability boundary.** `PreCompact` flushes local → canonical so nothing already saved is lost or left non-canonical when context is compressed.

## Architecture

### Mode switch

An fs client runs in one of two modes, keyed off whether a sync URL + token is resolvable (env `ZUG_SYNC_URL`/`ZUG_URL` + `ZUG_TOKEN`, or `~/.zug/config`):

- **synced** — server-canonical. Record locally, push raw logs, pull authoritative persona. No local synthesis.
- **local-only** — today's behavior unchanged: local synthesis, no network.

The Fly server identifies itself as canonical via an env flag (`ZUG_CANONICAL=1`, set in `fly.toml`); the http entrypoint sets it, stdio does not. This three-way switch (canonical server / synced client / local-only client) is read inside the two gate tools.

### Components

| Component | Role | Changes |
|-----------|------|---------|
| Server (Fly) | Canonical: merged logs + server-side synthesis | new `/sync/push` + `/sync/pull` endpoints; set `ANTHROPIC_API_KEY` + `ZUG_CANONICAL=1`; always-on (T-042) |
| fs client (CLI/desktop) | Local-first hot path + background sync | new `sync.ts`, `~/.zug/sync-state.json`, mode branch in the two gate tools, new CLI verbs, hook registration |
| Web client | Remote-only (already canonical) | none |

### Data flow (synced fs client)

- **Session start → `zug_get_context`:** `sync.pull()` with ~3s timeout → merge returned log entries into local files, atomically overwrite local `PERSONA/PLAYBOOK/ACTIVE` with the server's, advance pull cursor → then read local as today. On timeout/error: skip, read local, set **sync-paused** (surfaced in `zug_status`). *This is the outage fix.*
- **During session:** `zug_save_observation` etc. append locally only — no network on the hot path.
- **Session end → `zug_end_session`:** write session + observations locally (today's path **minus** the local persona-append and local `synthesize()` call). Background `sync.push()` of entries since cursor → server merges + runs canonical synthesis. On failure: entries stay unpushed (cursor not advanced); next pull/push or `zug sync` reconciles.
- **Compaction → `PreCompact` hook:** `zug push` flushes unpushed entries to canonical (idempotent; cursor advances so the later end-push sends only new deltas). PreCompact stdout is not injected into context, so reload is *not* done here — the `SessionStart`/`compact` hook (`zug resume`) handles context reload after compaction.

## Sync protocol

Two REST endpoints on the existing Express app (`http.ts`), behind the existing auth middleware (`X-Zug-Token` or Bearer). Plain REST chosen over new MCP tools because this is bulk log replication, not tool invocation.

### `POST /sync/push`

Request:
```json
{
  "sourceId": "<machine uuid>",
  "observations": [ /* Observation entries with timestamp > push cursor (from live + archive) */ ],
  "sessions":     [ { "filename": "2026-05-28-<sid>.md", "content": "..." } ],
  "growth":       [ /* GrowthSnapshot entries since cursor */ ],
  "reinforcements": [ /* full set (small) */ ],
  "lessons":        [ /* full set (small) */ ]
}
```
Server merges each artifact (strategies below). After merging observations, triggers incremental server-side synthesis over the newly-merged meaningful observations. Response:
```json
{ "accepted": { "observations": 12, "sessions": 1, "growth": 1, "reinforcements": 3, "lessons": 0 },
  "highWater": "2026-05-28T18:04:11.000Z" }
```

### `GET /sync/pull?since=<ISO>`

Response:
```json
{
  "observations": [ /* timestamp > since */ ],
  "sessions":     [ { "filename", "content" } /* not present locally */ ],
  "growth":       [ /* timestamp > since */ ],
  "reinforcements": [ /* full set */ ],
  "lessons":        [ /* full set */ ],
  "persona":  "<PERSONA.md>",
  "playbook": "<PLAYBOOK.md>",
  "active":   "<ACTIVE.md>",
  "highWater": "2026-05-28T18:04:11.000Z"
}
```
Client merges append artifacts (dedup), merges reinforcements/lessons by key, atomically overwrites local `PERSONA/PLAYBOOK/ACTIVE`, advances pull cursor to `highWater`.

### Cursor model — `~/.zug/sync-state.json`

```json
{
  "sourceId": "<uuid, minted once>",
  "pullSince": "<ISO high-water from last pull>",
  "pushSince": "<ISO of last successfully pushed entry>",
  "lastSyncedAt": "<ISO>",
  "status": "ok" | "paused",
  "lastError": "<string?>"
}
```
Cursors are an optimization to bound payload size; **correctness rests on dedup keys**, not cursor precision. Re-pushing/re-pulling overlapping ranges is idempotent. Mutable sets (reinforcements, lessons) are small and sent in full each sync, avoiding per-record cursors.

### Per-artifact merge strategies

| Artifact | Type | Merge key | Strategy |
|----------|------|-----------|----------|
| `observations.jsonl` (+ `observations.archive.jsonl`) | append log | `timestamp \| observation` | union dedup. **Synced log = live + archive combined.** |
| `sessions/*.md` | files | filename (`date-sessionId.md`) | union; identical filename ⇒ identical content by construction, keep existing |
| `growth.jsonl` | append log | `timestamp \| sessionId` | union dedup |
| `reinforcements.jsonl` | mutable set | normalized text | union; on match keep `max(count)` and latest `lastSeen` |
| `lessons.jsonl` | mutable set | `id` | union by id; ids are globally unique by construction (source-safe, below), so same id ⇒ same lesson ⇒ LWW by `lastReinforced` then `createdAt` |
| `open-thread.json` | ephemeral | — | **not synced** (per-session, transient) |
| `PERSONA/PLAYBOOK/ACTIVE` | projection | — | **pulled from server only; never pushed** |

## Sharp edges

### Observations truncation (handled)

The durable observation log is `observations.jsonl` ∪ `observations.archive.jsonl`. The archive is append-only and never pruned, so the union across all sources, deduped by `timestamp|observation`, is the complete history. Add `storage.ts` helpers that read both files for push computation. Existing `scripts/sync-to-fly.sh` (blunt full-volume tar push) is **superseded** for these artifacts by the granular protocol; deprecate it as a follow-up (not core to this slice).

### Source-safe lesson ids (collisions designed out)

`L-NNN` ids are minted locally by `max+1`, so two machines creating lessons before syncing can mint the same id for different lessons. Rather than reconcile collisions after the fact, ids are made **globally unique at creation**: each install has a stable short source tag (first 6 hex of the machine `sourceId`), and `createLesson()` mints `L-<srcTag>-<seq>` (e.g. `L-3f9a-1`, `L-3f9a-2`), where `seq` is the per-source local max + 1. Different machines never share a `srcTag`, so the same id never refers to two lessons — merge is a plain union by id with no remap path. Cost: the `/^L-\d{3,}$/` zod regex in `server.ts` (4 occurrences) relaxes to `/^L-[a-z0-9-]+$/`, three `storage.test.ts` assertions update, and ids read as `L-3f9a-1` instead of `L-005`. Migration is zero — no local `lessons.jsonl` exists and the canonical store has no active lessons.

### Concurrency between hook processes and the MCP server

Hooks run as separate short-lived processes from the stdio MCP server, but both write `~/.zug`. `storage.ts` assumes single-process serialization. Sync writes are append/idempotent except the projection overwrite on pull; that overwrite happens at session start (or compaction), when no active tool writes are in flight, and uses atomic temp-file + rename. Risk is low for a single user at session boundaries; documented, not engineered around further in v1.

## Client `sync.ts`

Pure functions over `fetch` (with `AbortController` timeout) and `storage.ts`:
- `resolveSyncConfig()` → `{ url, token }` from env or `~/.zug/config`, or `null` (local-only).
- `pull(opts)` → fetch `/sync/pull?since=cursor`, merge, overwrite projections, advance cursor. Never throws on network error: sets `status: "paused"`, returns a result object.
- `push(opts)` → gather entries since cursor (observations live+archive, sessions, growth, full reinforcements/lessons), POST `/sync/push`, advance cursor. Same non-throwing degradation.
- `sync()` → `push()` then `pull()`.

CLI verbs (`cli.ts`): `zug sync`, `zug pull`, `zug push` (all share `sync.ts`).

## Server changes

- `http.ts`: register `/sync/push` and `/sync/pull` behind existing auth + rate limit. Handlers merge via shared merge functions and (push) trigger `synthesize()` over newly-merged meaningful observations, writing canonical `PERSONA/PLAYBOOK/ACTIVE`.
- `fly.toml`: set `ANTHROPIC_API_KEY` (secret) and `ZUG_CANONICAL=1`; pair with always-on (T-042).
- Refactor `merge.ts`'s observation/session union logic into reusable functions consumed by both the CLI importer and the sync endpoints (single source of truth for merge).
- `storage.ts`: `createLesson()` mints source-safe ids `L-<srcTag>-<seq>` (see Source-safe lesson ids); relax the `/^L-\d{3,}$/` zod regex in `server.ts` (4 occurrences) to `/^L-[a-z0-9-]+$/`.

## Gate tool changes (`server.ts`)

Branch on the three-way mode (canonical server / synced client / local-only):
- `zug_get_context`: synced client → blocking `pull()` (timeout + fallback) before reading; canonical server and local-only → unchanged.
- `zug_end_session`: synced client → skip local persona-append + local `synthesize()`, background `push()`; canonical server → synthesize inline (unchanged); local-only → unchanged.

## Hook registration changes (`setup.ts`)

Verified against the Claude Code hooks docs (2026-05-28). Only `SessionStart` stdout is injected into the model's context; `PreCompact` and `SessionEnd` stdout are **not**.

| Action | Event | matcher | command | stdout→context |
|--------|-------|---------|---------|----------------|
| Pull + reload on cold start | `SessionStart` | `startup` (new entry) | `zug pull` then print a short resume note | yes |
| Pull + reload after compaction | `SessionStart` | `compact` (existing) | `zug resume` (pull + print checkpoint) | yes |
| Push (durability checkpoint) | `PreCompact` | `""` (existing) | `zug push` | no — irrelevant, push is a side effect |
| Push once at session end | `SessionEnd` | session-termination reasons (`clear`/`resume`/`logout`/`prompt_input_exit`/`bypass_permissions_disabled`/`other`) | `zug push` | no — irrelevant |

Notes:
- `SessionEnd` fires once when the session terminates (unlike `Stop`, which fires at the end of every turn) — so it's the correct place for an end-of-session push. It cannot block; fine for a flush.
- `SessionStart`/`compact` → `zug resume` remains the post-compaction context-reload path (its stdout *is* injected).
- All hook commands no-op cleanly in local-only mode (no sync config → return immediately).

### Honest limit of the compaction guarantee

`PreCompact` is a shell command, not a model turn: it flushes what is **on disk**, but cannot make the model emit `zug_save_observation` for observations it noticed but never saved. Those live in the conversation about to be summarized, no hook can extract them, and `PreCompact` stdout is not even injected, so it can't nudge the model pre-summary either. The guarantee is *"nothing already saved is lost or left non-canonical at compaction,"* not *"nothing the model knew is lost."* Capture of in-flight observations still depends on the auto-log / Observation-Gate discipline during the session; post-compaction reload depends on the `SessionStart`/`compact` hook.

## Testing

- **Unit:** each merge strategy (dedup, set-union, LWW, lesson remap); cursor advance + idempotency (push twice ⇒ no duplicates); pull merge + atomic projection overwrite; mode detection; graceful degradation (unreachable server ⇒ `paused`, local data intact).
- **Integration:** spin the Express app against a temp data dir as "server"; two temp data dirs as clients; assert both converge to the same merged log and pull the same canonical persona; assert a session run entirely with the server down keeps recording locally and reconciles on the next sync.
- Follow existing vitest co-located patterns (`storage.test.ts`, `server.test.ts`, `setup.test.ts`).

## Hook facts (verified 2026-05-28 against the Claude Code hooks docs)

1. `SessionStart` matchers: `startup`, `resume`, `clear`, `compact`. Use `startup` for cold start, `compact` for compaction-resume ⇒ register both.
2. `SessionEnd` exists and fires once when the session terminates (vs `Stop`, which fires per turn) ⇒ use `SessionEnd` for the end-of-session push.
3. Only `SessionStart` stdout is added to the model's context; `PreCompact` and `SessionEnd` stdout are not ⇒ those are side-effect (push) hooks, and context reload rides on `SessionStart`.

Source: code.claude.com/docs/en/hooks.md.

## Out of scope / follow-ups

- Tiering (free/paid) and BYOK-vs-server synthesis split.
- Durable multi-tenant accounts + OAuth (ADR-003 rework).
- Free→paid bulk migration.
- Deprecate `scripts/sync-to-fly.sh` for log artifacts.
