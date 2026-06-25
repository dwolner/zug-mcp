# Changelog

All notable changes to zug-mcp are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-06-24

Multi-tenancy foundation (ADR-005 decision 1) plus a sharper observation loop. The canonical
server becomes multi-tenant — each authenticated user gets a fully isolated cognitive
fingerprint — and the learning gate stops going quiet as a fingerprint matures.

### Added
- **Per-user storage namespacing (T-044).** Content moves to `<usersRoot>/<userId>/.zug/…`.
  Tenancy is threaded via `AsyncLocalStorage`: `getPaths()` resolves to the active user's
  namespace, or the flat legacy path absent a scope (stdio/local unchanged). The append-only-log
  + projection + merge/synthesize engines are unchanged — they just run per user.
- **Per-user synthesis queue.** Synthesis serializes per user (no PERSONA read-modify-write
  races) while running concurrently across users, so one user's session-end can't block another's.
  This is also the seam for the future per-user abuse cap.
- **Identity + isolation at the HTTP boundary.** Each `/mcp` and `/sync` request runs in a tenant
  scope (OAuth `client_id`, or a shared default for the legacy token); transports are keyed by
  `${userId}:${sessionId}`.
- **Idempotent migration** of existing single-user data into the default namespace on first boot,
  guarded by a `.migrated` marker. New `fly.toml` env: `ZUG_USERS_ROOT`, `ZUG_DEFAULT_USER_ID`.

### Changed
- **Observation Gate rewritten** (the `zug setup` rule) from a one-shot novelty filter into a
  router: new/contradicting → save; evolution/exception/nuance/second-order → save (now treated as
  higher-value as the PERSONA matures); **clean recurrence → `zug_reinforce_observation`** instead
  of being silently dropped. A robust PERSONA shifts *what* is captured, it doesn't make Zug go quiet.
- `zug compact` (PreCompact hook) no longer prints a dead "checkpoint" — PreCompact stdout is never
  injected into the model, so it now performs the durability push only (ISS-042).

### Fixed
- **Sync cursor clock-skew skip window (ISS-043).** The observation/growth cursor now advances to
  the max entry timestamp actually seen rather than the server's wall-clock `highWater`, so a
  back-dated entry under client/server clock skew can no longer be permanently skipped.

## [1.1.0] — 2026-05-28

Local-first single-user sync (ADR-004, slice 1). fs-capable clients become local-first
with background sync to a canonical remote, so a server outage degrades to "sync paused"
rather than total failure, and a single cognitive fingerprint is shared across machines.

### Added
- Three sync modes resolved automatically by `getSyncMode()`: `canonical` (the deployed
  server), `synced` (an fs client with `ZUG_URL` + `ZUG_TOKEN`), and `local-only` (the
  unchanged default).
- `GET /sync/pull` and `POST /sync/push` endpoints, behind the same auth + rate-limit as `/mcp`.
- CLI verbs `zug sync`, `zug pull`, `zug push`, and `zug resume` (compaction reload).
- Sync hooks registered by `zug setup`: `SessionStart` → pull (and reload on compaction),
  `SessionEnd` → push, `PreCompact` → durability push.
- Per-install `~/.zug/source-id` and source-safe lesson IDs (`L-<tag>-<seq>`) so cross-machine
  merges are collision-free by construction.
- `ZUG_CANONICAL` and `ZUG_SYNC_URL` configuration; sync config readable from `~/.zug/config`.

### Changed
- Synced setups synthesize PERSONA/PLAYBOOK/ACTIVE **server-side** over the merged log;
  projections are pulled only, never pushed, so there is exactly one authoritative fingerprint.
- The Fly server is now always-on and canonical (`ZUG_CANONICAL=1`, `auto_stop_machines = 'off'`,
  `min_machines_running = 1`).
- `ZUG_TOKEN` is now the shared bearer credential between the canonical server and its synced
  CLI clients (must match on both), not just a legacy non-OAuth token.

### Fixed
- Graceful degradation: an unreachable server now pauses sync and lets the session continue
  locally, reconciling on the next successful sync — the root cause of the 2026-05-27
  "Session not found" outage class.

## [1.0.0] – [1.0.4] — 2026-05-26

Initial public release: OSS distribution and first-run hardening.

### Added
- Published to npm as `zug-mcp` (MIT), with `zug` and `zug-mcp` binaries.
- `zug setup` auto-detects installed agents (Claude Code, Cursor, Windsurf) and writes MCP config.
- CLI: `zug status`, `zug tail`, `zug persona`, `zug onboard`, `zug update`, `zug archive`, `zug backup`.
- `PERSONA.md` seeded from an embedded template on first setup; idempotent Claude Code hook registration.

### Fixed
- First-run gaps: MCP entries now always include `type: 'stdio'`; missing-`ANTHROPIC_API_KEY`
  warnings; observation pruning after synthesis and >90-day session archiving (archive stays local).

## Earlier

Pre-npm development (Phases 1–6): local stdio transport, Haiku synthesis, HTTP transport,
polish, session fidelity, and advanced persistence. See [ROADMAP.md](./ROADMAP.md) for the
full phase history.
