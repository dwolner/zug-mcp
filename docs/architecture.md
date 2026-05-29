# Architecture

## Overview

```
Machine A (CLI/desktop)        Machine B (CLI/desktop)        claude.ai web
  synced client                  synced client                 OAuth client
        │                              │                             │
        │ write local + push/pull      │ push/pull                   │ MCP over HTTP
        └──────────────┬───────────────┴──────────────┬──────────────┘
                       ▼                               ▼
              Canonical Zug server (Fly, ZUG_CANONICAL=1, always-on)
                       │  merged append-only logs + server-side synthesis
                       ▼
              /data/.zug (persistent volume)
                ├── PERSONA.md / PLAYBOOK.md / ACTIVE.md   ← authoritative, regenerated
                ├── observations.jsonl / growth.jsonl
                ├── lessons.jsonl
                └── sessions/

local-only mode (no server configured): a single machine reads/writes its own
~/.zug/ and synthesizes locally if ANTHROPIC_API_KEY is set — no sync involved.
```

## Source Files

| File | Role |
|---|---|
| `src/storage.ts` | All file I/O. Reads/writes PERSONA, PLAYBOOK, observations, sessions, lessons, growth. No business logic. |
| `src/server.ts` | MCP tool definitions. Calls storage, returns results. No transport concerns. Gate handlers (`runGetContext`/`runEndSession`) branch on sync mode. |
| `src/stdio.ts` | Entry point for Claude Code / Claude desktop (stdio transport). |
| `src/http.ts` | Entry point for the HTTP server (claude.ai web + canonical sync). Hosts `/mcp` and the `/sync/*` endpoints behind shared auth + rate-limit. |
| `src/sync-state.ts` | Sync mode resolution (`getSyncMode`), config (`resolveSyncConfig` from env or `~/.zug/config`), per-source identity (`getSourceId`), and cursor state (`~/.zug/sync-state.json`). |
| `src/sync.ts` | Client-side `pull` / `push` / `sync`. Never throws — on failure it records `paused` so a server outage degrades gracefully. |
| `src/sync-server.ts` | Server-side `handleSyncPull` / `handleSyncPush`. Push merges incoming logs and triggers canonical synthesis. |
| `src/merge-core.ts` | Pure per-artifact merge logic (reinforcements, lessons). Deterministic, no I/O. |
| `src/merge.ts` | One-shot import of another machine's `~/.zug/` (the `pnpm merge` path). |
| `src/sync-types.ts` | Wire types shared between client and server (`SyncPayload`, `PullResponse`, `PushResult`). |
| `src/synthesize.ts` | Haiku synthesis of PERSONA/PLAYBOOK/ACTIVE from observations. Runs on the canonical server (synced) or locally (local-only). |
| `src/oauth-provider.ts` | OAuth 2.1 (PKCE) for claude.ai web. |
| `src/rate-limit.ts` / `src/api-key.ts` / `src/onboard.ts` | Rate-limit middleware, API-key resolution, and the interactive onboarding seed. |

## Transport

**stdio** — Claude Code / desktop spawn the MCP server as a child process and communicate via stdin/stdout. Works entirely locally; this is `local-only` and `synced` clients' MCP path.

**HTTP** — `src/http.ts` serves the same `server.ts` tool logic over Streamable HTTP for claude.ai web (OAuth), and additionally exposes `GET /sync/pull` + `POST /sync/push` for CLI/desktop sync clients. Both sit behind the same bearer/OAuth auth and rate-limiting as `/mcp`. The server is deployed on Fly with a persistent volume; it is **not** a Cloudflare tunnel.

## Sync Architecture (ADR-004)

Three modes resolved by `getSyncMode()`:

- **`canonical`** (`ZUG_CANONICAL=1`, the Fly server) — owns the merged append-only logs and runs synthesis. Always-on so it never cold-starts mid-session.
- **`synced`** (fs client with `ZUG_URL` + `ZUG_TOKEN`) — writes locally on the hot path, pushes raw logs to the server, pulls the one authoritative PERSONA/PLAYBOOK/ACTIVE.
- **`local-only`** (no config) — original single-machine behavior, unchanged.

Key invariants:

- **Projections are pulled, never pushed.** PERSONA/PLAYBOOK/ACTIVE are regenerated server-side from the merged log, so there is exactly one authoritative fingerprint. Clients only ever upload raw observations/sessions/growth/lessons/reinforcements.
- **Synthesis is triggered on push** (`sync-server.ts`), only when new non-low-confidence observations arrive — not on pull.
- **Collision-free by construction.** Lesson IDs are `L-<source-tag>-<seq>` using a per-install `source-id`, so cross-machine merges never collide.
- **Failure degrades, never blocks.** `sync.ts` never throws; a failed sync sets `status: "paused"` in `sync-state.json` and the session continues locally, reconciling on the next successful sync.

## Data Model

### observations.jsonl
One JSON object per line, append-only:
```json
{
  "timestamp": "2026-03-09T14:00:00Z",
  "type": "cognitive_pattern",
  "observation": "Resists ideas initially, then comes around after reflection",
  "session_id": "2026-03-09-learning-companion",
  "confidence": "high"
}
```

Types: `cognitive_pattern | preference | mistake | breakthrough | context`
Confidence: `low | medium | high` (low is never written to PERSONA.md)

### PERSONA.md
Human-readable markdown. Starts manually seeded, grows via session appends (Phase 1) or Haiku synthesis (Phase 2). Capped at ~600 lines with summarization.

### PLAYBOOK.md
Universal patterns — not about the user but about what works in learning sessions. Updated less frequently than PERSONA.md.

### sessions/YYYY-MM-DD-{id}.md
Full session log: summary + all observations from that session. Source of truth for reprocessing history if PERSONA.md gets corrupted.

## Adding a New Tool

1. Add a function to `storage.ts` if new file I/O is needed
2. Add a `server.tool()` call in `server.ts`
3. Update the Zug rule in `prompts/zug-rule.md` if Claude needs new instructions for when to call it

## Phase 2: Haiku Synthesis

`zug_end_session` collects session observations, reads current PERSONA.md and PLAYBOOK.md, and calls `claude-haiku-4-5-20251001` with a conservative synthesis prompt. The call runs in the background (non-blocking), with a 30s timeout and 2 retries. On failure, raw observations appended in Phase 1 remain in PERSONA.md as the fallback. See `src/synthesize.ts` and ADR-002.
