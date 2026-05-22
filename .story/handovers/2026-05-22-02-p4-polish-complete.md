# Session Handover — 2026-05-22 — p4 Polish Phase Complete

## What happened

First real autonomous session on this project. Completed all 6 p4 Polish phase tickets in one run. The project went from 1/16 tickets complete (only T-011 done manually before autonomous mode) to 6/16, with the entire Polish phase finished.

## Tickets completed

**T-011** — Tests for storage and synthesize layers
- Refactored `storage.ts` to read `ZUG_DATA_DIR` lazily (per-call, not module-load) so tests can use isolated temp dirs
- 28 tests: all storage I/O paths, synthesize XML parsing, prompt construction, error handling
- Vitest installed; `pnpm test` and `pnpm typecheck` both clean

**T-009** — Onboarding flow (5-question seed PERSONA.md)
- `src/onboard.ts`: interactive 5-question CLI, Haiku synthesis, plain-markdown fallback
- `src/api-key.ts`: extracted `loadApiKey()` and `HAIKU_MODEL` constant from `synthesize.ts` — shared by both
- `install.sh` now calls `npx tsx src/onboard.ts` instead of copying blank template
- Guards: skips if PERSONA.md exists with real content (`[Write here]` sentinel), skips if non-TTY

**T-007** — Extended zug_status
- 3 new storage functions: `getLastSessionDate()`, `getPersonaExcerpt(maxLines)`, `getObservationTrend(weeks)`
- `getObservationTrend` uses 28-day rolling window, buckets oldest→newest; off-by-one clamp fix included
- `zug_status` tool now returns: sessions + last date, observations, persona lines, 2-line excerpt, 4-week trend
- 9 new tests

**T-008** — CLI: zug status, zug tail, zug persona
- `src/cli.ts` with `#!/usr/bin/env tsx` shebang, argv dispatch
- `package.json` gets `"bin": { "zug": "src/cli.ts" }` and `"cli": "tsx src/cli.ts"` script
- `install.sh` runs `pnpm link --global` to make `zug` available system-wide
- Bug fixed: `getObservationTrend` bucketing clamp (ts=now produced weekIndex=weeks, out-of-bounds)

**T-010** — Linux support in install.sh
- Replaced all 4 python3 heredoc JSON-patching blocks with `node -` + `process.argv` helpers (`patch_mcp_config`, `patch_http_config`) — removes python3 as a dependency
- Added git check to dependency section (before any git usage)
- Blanked `CLAUDE_DESKTOP` on Linux (Claude Desktop is macOS/Windows only)

**T-006** — OAuth 2.1 support for HTTP server
- `src/oauth-provider.ts`: full `OAuthServerProvider` implementation — in-memory Maps, dynamic client registration (claude.ai redirect URIs only), PKCE, single-use auth codes with 10-min TTL, refresh token rotation (OAuth 2.1 §6), lazy expiry cleanup
- `src/http.ts`: migrated from bare `http.createServer` to Express; `mcpAuthRouter` at root; dual auth on `/mcp`: Bearer (OAuth) or `X-Zug-Token` (legacy)
- New env var: `ZUG_URL` — bare origin, validated at startup (throws if path component present)
- `express` + `@types/express@^5.0.0` added as dependencies
- ISS-013 filed: open `/register` endpoint (PKCE prevents actual theft; acceptable for personal tool)

## Architecture decisions made

- **`ZUG_DATA_DIR` lazy evaluation**: was a module-level constant, now computed per-call in `getPaths()`. This is the correct pattern for testability and allows env var overrides to work after module load.
- **`api-key.ts` shared module**: `loadApiKey()` and `HAIKU_MODEL` live here. `synthesize.ts`, `onboard.ts`, and any future callers import from this single source.
- **OAuth is in-memory only**: fly.io `auto_stop_machines = 'stop'` kills the process. Tokens don't survive restarts. Clients must re-authorize. This is documented at startup. Volume-backed persistence is a future option if it becomes painful.
- **Dual auth on /mcp**: Bearer token (OAuth path) and `X-Zug-Token` header (legacy path) both work. Nothing breaks for existing Claude Code / curl clients.

## Current state

**6/16 tickets complete** — all p4 Polish phase done. The next phase is p5 Session Fidelity:
- T-012: `.claude/rules/` injection (was mid-plan when session paused)
- T-001: PreCompact hook
- T-003: Structured end_session
- T-002: Delta session start
- T-004: Observation reinforcement

## Open issues logged this session

- ISS-001: `loadApiKey` ignores `ZUG_DATA_DIR` for `.env` lookup
- ISS-002: `synthesizePersona` swallows errors silently in onboarding
- ISS-008: `synthesize-cli.ts` hardcodes `~/.zug` path, ignores `ZUG_DATA_DIR`
- ISS-013: OAuth `/register` endpoint is open (PKCE mitigates; acceptable for personal tool)

## Testing checklist for next session / work machine

User plans to install on their work machine and do a real-world test before continuing p5 work. Evaluation points:
1. `install.sh` runs without errors (git + node only, no python3 required)
2. Onboarding skips correctly (existing PERSONA.md with real content)
3. `zug status` / `zug tail` / `zug persona` all work
4. `zug_get_context` returns fingerprint + active patterns in Claude Code
5. `zug_status` MCP tool shows enriched output (last date, excerpt, trend)
6. Saving an observation → `zug tail` shows it
7. `zug_end_session` increments session count
8. OAuth (optional): Claude.ai Settings → Integrations with `ZUG_URL` set

## Next session start

Run `/story` to reload context. T-012 was mid-plan (planning stage, no code written). Start fresh on T-012 — the ticket description is clear and no prior plan needs to be preserved.
