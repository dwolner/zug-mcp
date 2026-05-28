# Session Handover — T-043 local-first single-user sync engine

## What Was Done

Designed and implemented T-043 end-to-end: **local-first single-user sync** (slice 1 of ADR-004). Shipped on branch `feat/t-043-local-first-sync` (20 commits), **PR #1 open** against `main`: https://github.com/dwolner/zug-mcp/pull/1. 176 tests pass (9 files), typecheck + build clean. T-043 marked complete.

Workflow used: brainstorming → wrote+committed a design spec → wrote+committed a 15-task implementation plan → executed via subagent-driven development (fresh implementer subagent per task + two-stage spec-then-quality review per task) → final holistic review (opus) → PR.

- Spec: `docs/superpowers/specs/2026-05-28-local-first-single-user-sync-design.md`
- Plan: `docs/superpowers/plans/2026-05-28-local-first-single-user-sync.md`

## Architecture Delivered

- **Three modes** via `getSyncMode()` (`src/sync-state.ts`): `canonical` (Fly server, `ZUG_CANONICAL=1`), `synced` (fs client with `ZUG_URL`+`ZUG_TOKEN` resolvable), `local-only` (no config — today's behavior, unchanged).
- **Server is canonical**: holds the merged append-only logs and runs synthesis. Synced clients write locally (hot path), `push` raw logs, and `pull` the one authoritative `PERSONA/PLAYBOOK/ACTIVE`. Projections are **pulled only, never pushed** (verified). A server outage degrades to "sync paused" (recorded in `~/.zug/sync-state.json`), never total failure — this is the fix for the 2026-05-27 `Session not found` class.
- **New modules**: `merge-core.ts` (pure per-artifact merges), `sync.ts` (`pull`/`push`/`sync`, never throw → set `paused`), `sync-state.ts` (mode + cursor state + `getSourceId`), `sync-server.ts` (`handleSyncPull`/`handleSyncPush` + canonical synthesis), `sync-types.ts` (wire types).
- **Endpoints**: `GET /sync/pull` + `POST /sync/push` in `http.ts`, behind the SAME auth+rate-limit as `/mcp` (extracted into shared `zugAuth`/`rateLimitMw` — `/mcp` behavior preserved verbatim).
- **Gate tools** (`server.ts`): handlers extracted to exported `runGetContext`/`runEndSession`; synced mode pulls before reading on get_context, and skips local persona-append + local synthesize and fires `push()` on end_session. Canonical + local-only keep the old inline-synth path.
- **Hooks** (`setup.ts`): `SessionStart` `startup`→`zug pull`, `compact`→`zug resume`; `SessionEnd`→`zug push`; `PreCompact`→`zug compact` (durability push). Idempotent registration. CLI verbs `zug sync`/`pull`/`push`.
- **Source-safe lesson ids** `L-<tag>-<seq>` (per-install 6-hex tag from `~/.zug/source-id`) so cross-machine merge is collision-free by construction (replaced an earlier reactive-remap design). Lesson-id zod regex relaxed to `/^L-[a-z0-9-]+$/`.
- `fly.toml`: `ZUG_CANONICAL=1` + always-on (`auto_stop_machines=off`, `min_machines_running=1`) — also satisfies T-042. New dist modules added to `package.json` `files` so `npm install -g` ships them (import graph traced — complete).

## Key Decisions

- **Scope cut to single-user** (defer tiering/multi-tenant accounts/billing/free→paid migration to later ADR-004 slices). The Fly server is treated as the user's personal canonical store; this is the ADR's "paid path" minus the paywall.
- **Server-canonical synthesis** (not peer/log-only) so there is one deterministic persona; CLI now behaves like web/desktop which already synthesize server-side.
- **Source-safe-at-creation ids** over collision-detect-and-remap: designing the collision out is strictly simpler (no remap protocol, no reference-rewrite cascade). Migration cost was zero (no existing lessons).
- **PreCompact is durability-only**: verified against the Claude Code hooks docs that PreCompact stdout is NOT injected into context (only SessionStart is). Post-compaction reload rides on `SessionStart`/`compact`→`zug resume`.

## What's Open / Next Steps

- **PR #1 awaiting merge** (no cleanup done — branch preserved for PR iteration). Project history is normally direct-to-main; user chose a PR this time.
- **Deploy (not done)**: `fly secrets set ANTHROPIC_API_KEY=... -a zug-mcp` then redeploy zug-mcp (now always-on) so canonical synthesis works. Live smoke: synced CLI pulls canonical persona on start + pushes on end; confirm a second machine converges.
- **ISS-043** (low, open): observation/growth sync cursor uses server wall-clock `highWater`; advancing it to max-entry-timestamp would close a narrow clock-skew skip window (spec-accepted for single-user).
- **ISS-042** (low, open): the `PreCompact`→`zug compact` checkpoint print is dead (stdout not injected); left open as a cleanup since this branch repurposed PreCompact for the push but kept the print.

## Test/Build Status

176 tests pass across 9 files (incl. `sync-integration.test.ts`: two-client convergence + offline degradation). `pnpm typecheck` clean, `pnpm build` clean. No regressions to the existing 143-test baseline.

## Branch

`feat/t-043-local-first-sync` — pushed to origin, PR #1 open. `main` unmoved since branch point (clean merge).
