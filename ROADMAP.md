# Zug — Roadmap

## Phase 1 — Local stdio ✅

**Goal:** Claude Code gets persistent memory you write manually.

**What was built:**
- MCP server with 5 tools: `zug_get_context`, `zug_save_observation`, `zug_end_session`, `zug_get_recent_sessions`, `zug_status`
- File-based storage at `~/.zug/` (PERSONA.md, PLAYBOOK.md, observations.jsonl, sessions/)
- stdio transport for Claude Code / Claude desktop
- `~/.claude/rules/zug.md` — global rule that activates Zug in every Claude Code session
- Install script for macOS (registers MCP server in `~/.claude.json`)
- PERSONA.md template for new users

**Limitation:** PERSONA.md grows by appending raw observations. No synthesis — the fingerprint gets noisy over time.

---

## Phase 2 — Haiku Synthesis ✅

**Goal:** PERSONA.md and PLAYBOOK.md are actively maintained by AI, not just appended to.

**What was built:**
- `src/synthesize.ts` — sends current PERSONA + PLAYBOOK + session observations to Claude Haiku
- Conservative synthesis prompt: "Add only what you have direct evidence for. Don't remove without contradicting evidence."
- Trim guard: when PERSONA exceeds 600 lines, Haiku summarizes oldest sections
- Graceful fallback: if no API key or synthesis fails, reverts to Phase 1 append behavior
- `ANTHROPIC_API_KEY` loaded from env or `~/.zug/.env`
- `zug_end_session` response reports "synthesized" vs "appended" so you can tell which path ran
- `src/merge.ts` + `pnpm merge` command — imports external `~/.zug/` data from another machine:
  - Deduplicates and merges `observations.jsonl`
  - Copies missing session files
  - Uses Haiku to synthesize both PERSONAs/PLAYBOOKs into a unified version
  - Backs up originals before overwriting

**Data considerations:**
- Session data is processed locally using your own API key
- Nothing leaves your machine except API calls to Anthropic
- Each `zug_end_session` costs ~$0.001–0.003 in Haiku tokens

---

## Phase 3 — HTTP Transport ✅

**Goal:** All Claude surfaces share the same memory via a persistent remote server.

**What was built:**
- `src/http.ts` — Express server wrapping the same tools with HTTP/Streamable transport
- Auth middleware: `X-Zug-Token` header validated before MCP handshake
- Deployed on fly.io with persistent volume at `/data/.zug/` (data survives redeploys via `ZUG_DATA_DIR`)
- `install.sh --configure-http <url> <token>` configures all clients automatically
- CI/CD: GitHub Actions workflow deploys to fly.io on every push to main

**Client support (actual state):**
| Surface | Transport | Status |
|---|---|---|
| Claude Code CLI | HTTP native | ✅ Works |
| Claude Desktop | `mcp-remote` stdio proxy → HTTP | ✅ Works |
| Claude.ai web | OAuth (Phase 4) | ✅ Works |

**fly.io note:** Machines sleep after inactivity, cold start ~2-3s. Upgrade to `min_machines_running = 1` when cold starts become disruptive.

---

## Phase 4 — Polish ✅

**Goal:** Zug is reliable, maintainable, and easy to hand to someone else.

**What was built:**
- ✅ Context tagging — optional `context` field on observations and sessions; `zug_get_recent_sessions` filterable by context
- ✅ Tests — Vitest unit tests for `storage.ts` and `synthesize.ts`; `storage.ts` refactored to read `ZUG_DATA_DIR` lazily for test isolation (T-011)
- ✅ Onboarding flow — interactive 5-question CLI seeding `PERSONA.md` via Haiku on first install; `src/api-key.ts` extracted as shared module (T-009)
- ✅ Extended `zug_status` — last session date, 2-line PERSONA excerpt, 4-week rolling observation trend (T-007)
- ✅ CLI — `zug status`, `zug tail [n]`, `zug persona`; global binary via `pnpm link --global` (T-008)
- ✅ Linux support — replaced python3 JSON-patching blocks with `node -` + `process.argv` helpers; added git dependency check (T-010)
- ✅ OAuth 2.1 — `src/oauth-provider.ts` with PKCE, refresh token rotation, code TTL, in-memory storage; `src/http.ts` migrated to Express with `mcpAuthRouter`; dual auth preserves legacy `X-Zug-Token` (T-006)
- ✅ Synthesis timeout fix — `zug_end_session` appends observations immediately and runs Haiku synthesis in the background; no MCP transport timeouts

---

## Phase 5 — Session Fidelity ✅

**Goal:** Deeper session continuity and pattern reinforcement. Sessions survive compaction, priming is fast and accurate, patterns accumulate weight over time.

**What was built:**
- `.claude/rules/` injection — write cognitive fingerprint as always-on structural gate; no hook or tool call required (T-012) — no deps, highest value
- PreCompact hook — checkpoint session state before Claude compacts context (T-001) — no deps
- Structured end_session — typed fields: decisions, blockers, next_steps (T-003) — no deps; enriches data for T-005
- Triple-layer compaction survival — PreCompact + SessionStart hook + rules file; any one can fail without data loss (T-013) — blocked by T-001, T-012
- Delta session start — surface what's new since last session, not a full context dump (T-002) — no deps
- Observation reinforcement — frequency signal on repeating patterns; promotes load-bearing patterns in PERSONA.md (T-004) — blocked by T-011
- Session priming comparison — benchmark full load vs. delta vs. hybrid (T-005) — blocked by T-002, T-003
- Session priming hybrid — fast structured MCP summaries + qualitative files (T-014) — blocked by T-005

---

## Phase 6 — Advanced Persistence ✅

**Goal:** Structural reliability for long-running and autonomous modes; multi-agent cognitive analysis.

**What was built:**
- Multi-lens reasoning analysis — parallel specialized subagents analyzing reasoning from multiple angles (conceptual clarity, assumptions, knowledge gaps, logical consistency), merged and judged (T-016) — independent, no deps
- Multi-signal session health — compute session pressure from independent signals (observation count, topic depth, compaction proximity, open Socratic threads) (T-015) — needs a proactive mode ticket to anchor it

---

## Phase 7 — OSS Distribution ✅

**Goal:** `npm install -g zug-mcp` — installable, agent-agnostic, MIT-licensed.

**What was built:**
- Published to npm as `zug-mcp` with `zug` / `zug-mcp` bins
- `zug setup` auto-detects installed agents (Claude Code, Cursor, Windsurf) and writes MCP config to each
- Embedded rule + PERSONA template content (no reliance on shipping a `templates/`/`prompts/` dir)
- `zug update` refreshes the rule file and hooks after upgrade

---

## Phase 8 — First-Run UX ✅

**Goal:** Close the critical gaps in the npm install + `zug setup` path for new public users.

**What was built:**
- MCP config entries always include `type: 'stdio'`; idempotent hook registration (`SessionStart`, `SessionEnd`, `PreCompact`)
- Visible warnings when `ANTHROPIC_API_KEY` is missing (degrades to plain-markdown append; PERSONA growth risk)
- `PERSONA.md` seeded from an embedded template on first setup
- Local history hygiene — `archiveObservations()` after synthesis, `archiveSessions()` / `zug archive` for >90-day logs (archive stays local)

---

## Phase 9 — Local-First Sync (ADR-004) ✅ — released in 1.1.0

**Goal:** Make fs-capable clients local-first with background sync to a canonical remote, so a server outage degrades to "sync paused" rather than total failure, and a single fingerprint is shared across machines.

**What was built:**
- Three modes via `getSyncMode()`: `canonical` (the Fly server), `synced` (fs client with `ZUG_URL`+`ZUG_TOKEN`), `local-only` (unchanged default)
- Server-canonical model: clients write locally and push raw logs; server merges and synthesizes; PERSONA/PLAYBOOK/ACTIVE are pulled only, never pushed
- `GET /sync/pull` + `POST /sync/push` behind the same auth + rate-limit as `/mcp`
- Sync hooks (`SessionStart`→pull, `SessionEnd`→push, `PreCompact`→durability push) and `zug sync`/`pull`/`push` CLI verbs
- Source-safe lesson IDs (`L-<tag>-<seq>`) for collision-free cross-machine merge
- Fly server made always-on + canonical (`ZUG_CANONICAL=1`), fixing the cold-start "Session not found" outage class

**Deferred to later ADR-004 slices:** multi-tenant accounts, billing, and free→paid migration.

---

## Future / Ideas

- **Proactive mode:** Zug sends you a message when it thinks of something relevant to your history
- **Voice:** Zug as a phone number or voice endpoint
- **Multi-user:** One server, multiple user namespaces, each with their own fingerprint
- **Export:** Download your full cognitive fingerprint as a portable document
- **Graph view:** Visualize how your thinking has evolved over time

---

## Contributing

Phases 1–9 have shipped (latest: local-first sync in 1.1.0). The next frontier is the deferred ADR-004 slices — multi-tenant accounts, billing, free→paid migration — and the Future / Ideas above.

If you're contributing, read `docs/architecture.md` and the ADRs in `docs/adr/` first.
