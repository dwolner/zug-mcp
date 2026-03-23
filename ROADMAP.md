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

## Phase 3 — HTTP Transport + Claude.ai Web 📋

**Goal:** All Claude surfaces (Claude Code, Claude desktop, Claude.ai web on any account) share the same memory.

**What to build:**
- `src/http.ts` — Express server wrapping the same tools with HTTP/SSE transport
- Auth middleware: shared secret header (`X-Zug-Token`) validated before MCP handshake
- Tunnel options (pick one):
  - Cloudflare Tunnel (free, stable URL, data stays local)
  - Tailscale Funnel (free if already using Tailscale)
  - fly.io (~$3/mo, always-on, good for multi-device)
- Register HTTP URL in Claude.ai Settings → Integrations → MCP
- npm scripts: `start:stdio`, `start:http`
- `launchd` plist for macOS auto-start (if tunnel approach)

**Multi-account note:** Multiple Claude.ai accounts point at the same HTTP endpoint and share one PERSONA.md. Same person, same fingerprint. If separation is needed later, a `?context=work` query param can partition the data.

**Security checklist:**
- [ ] Auth header required on all requests
- [ ] PERSONA.md never exposed without auth
- [ ] Tunnel URL configured (not random)
- [ ] Token stored in `~/.zug/.env`, never in the repo

---

## Phase 4 — Polish 📋

**Goal:** Zug is reliable, maintainable, and easy to hand to someone else.

**What to build:**
- `zug_status` extended: last session date, PERSONA.md excerpt, growth trend
- CLI: `zug status`, `zug tail` (recent observations), `zug persona` (print fingerprint)
- Onboarding flow: new user runs install, answers 5 questions, Haiku writes their seed PERSONA.md
- Linux support in install.sh
- Tests for storage and synthesis layers

---

## Future / Ideas

- **Proactive mode:** Zug sends you a message when it thinks of something relevant to your history
- **Voice:** Zug as a phone number or voice endpoint
- **Multi-user:** One server, multiple user namespaces, each with their own fingerprint
- **Export:** Download your full cognitive fingerprint as a portable document
- **Graph view:** Visualize how your thinking has evolved over time

---

## Contributing

Each phase has a clear entry point. Phase 3 is the highest-leverage next step — it's what connects all Claude surfaces to one shared memory.

If you're building Phase 3 or 4, read `docs/architecture.md` first.
