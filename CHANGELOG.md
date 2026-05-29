# Changelog

All notable changes to zug-mcp are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
