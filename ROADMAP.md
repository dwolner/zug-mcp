# Zug — Roadmap

## Phase 1 — Local stdio ✅

**Goal:** Claude Code gets persistent memory you write manually.

**What was built:**
- MCP server with 5 tools: `zug_get_context`, `zug_save_observation`, `zug_end_session`, `zug_get_recent_sessions`, `zug_status`
- File-based storage at `~/.zug/` (PERSONA.md, PLAYBOOK.md, observations.jsonl, sessions/)
- stdio transport for Claude Code / Claude desktop
- `~/.claude/rules/zug.md` — global rule that activates Zug in every Claude Code session
- Install script for macOS

**Limitation:** PERSONA.md grows by appending raw observations. No synthesis — the fingerprint gets noisy over time.

---

## Phase 2 — Haiku Synthesis 🔜

**Goal:** PERSONA.md and PLAYBOOK.md are actively maintained by AI, not just appended to.

**What to build:**
- In `zug_end_session`: after writing the session log, call Claude Haiku with:
  - Current PERSONA.md
  - Current PLAYBOOK.md
  - Observations from this session
  - Session summary
- Haiku outputs updated versions of both files
- Guard prompt: "Add only what you have direct evidence for. Don't remove without contradicting evidence. Be conservative."
- Trim gate: if PERSONA.md exceeds 600 lines, summarize the oldest section first
- `ANTHROPIC_API_KEY` loaded from env or `.env` file at `~/.zug/.env`

**Data considerations:**
- Session data is processed locally using your own API key
- Nothing leaves your machine except API calls to Anthropic

---

## Phase 3 — HTTP Transport + Claude.ai Web 📋

**Goal:** All Claude surfaces (Claude Code, Claude desktop, Claude.ai web on any account) share the same memory.

**What to build:**
- `src/http.ts` — Express server wrapping the same tools with HTTP/SSE transport
- Auth middleware: shared secret header (`X-Zug-Token`) validated before MCP handshake
- Named Cloudflare tunnel (free): stable `*.cfargotunnel.com` URL
- Register HTTP URL in Claude.ai Settings → Integrations → MCP (both accounts)
- npm scripts: `start:stdio`, `start:http`
- `launchd` plist for macOS auto-start

**Multi-account note:** Both Claude.ai accounts point at the same HTTP endpoint and share one PERSONA.md. Same person, same fingerprint. If you want separation later, a `?context=work` query param can partition the data.

**Security checklist:**
- [ ] Auth header required on all requests
- [ ] PERSONA.md never exposed without auth
- [ ] Cloudflare tunnel name configured (not random URL)
- [ ] Token stored in `~/.zug/.env`, never in the repo

---

## Phase 4 — Polish 📋

**Goal:** Zug is reliable, maintainable, and easy to hand to someone else.

**What to build:**
- `zug_status` extended: last session date, PERSONA.md excerpt, growth trend
- CLI: `zug status`, `zug tail` (recent observations), `zug persona` (print fingerprint)
- PERSONA.md trim logic: automatic summarization when file exceeds threshold
- Onboarding flow: new user runs install, answers 5 questions, Haiku writes their seed PERSONA.md
- Linux support in install.sh
- Tests for storage layer

---

## Future / Ideas

- **Proactive mode:** Zug sends you a message when it thinks of something relevant to your history ("I've been thinking about what you said about X...")
- **Voice:** Zug as a phone number or voice endpoint
- **Multi-user:** One server, multiple user namespaces, each with their own fingerprint
- **Export:** Download your full cognitive fingerprint as a portable document
- **Graph view:** Visualize how your thinking has evolved over time

---

## Contributing

Each phase has a clear entry point. Phase 2 is the highest-leverage next step — it's what makes the fingerprint accurate over time rather than just growing.

If you're building Phase 3 or 4, read `docs/architecture.md` first.
