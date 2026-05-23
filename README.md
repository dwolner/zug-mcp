# Zug — Persistent Memory for Your AI Learning Companion

**Zug** (Hebrew: "pair") is an MCP server that gives Claude persistent memory across sessions — building a cognitive fingerprint of how you think, where you get stuck, what excites you, and how you grow over time.

It's built around the Jewish concept of *havruta*: the idea that learning alongside a partner produces something neither could reach alone. Zug is the infrastructure that makes that long-term relationship possible.

---

## What It Does

Zug exposes five tools Claude can call during any session:

| Tool | When it's called |
|---|---|
| `zug_get_context` | Session start — loads your cognitive fingerprint, playbook, and active patterns |
| `zug_save_observation` | Mid-session — saves a pattern, preference, breakthrough, or mistake |
| `zug_end_session` | Session end — writes the session log, updates your fingerprint in the background |
| `zug_get_recent_sessions` | After a gap — re-establishes context from past sessions |
| `zug_status` | Anytime — shows sessions, observations, persona size, excerpt, and weekly trend |

### CLI

After install, `zug` is available as a global command:

```bash
zug status        # sessions, observations, trend, persona excerpt
zug tail [n]      # last N observations (default 10)
zug persona       # print full PERSONA.md
```

### Context Tagging

`zug_save_observation` and `zug_end_session` accept an optional `context` field (e.g. `"work"`, `"personal"`). Tagged data stays in the unified fingerprint but can be filtered:

```json
{ "limit": 20, "context": "work" }
```

Your data lives at `~/.zug/`:
```
~/.zug/
├── PERSONA.md         ← your cognitive fingerprint (grows over time)
├── PLAYBOOK.md        ← what works universally (updated each session)
├── ACTIVE.md          ← active patterns for the next session
├── observations.jsonl ← structured observation log
└── sessions/          ← full session logs by date
```

---

## Quick Install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/dwolner/zug-mcp/main/install.sh)
```

Or manually:

```bash
git clone https://github.com/dwolner/zug-mcp ~/.zug/server
cd ~/.zug/server
pnpm install
./install.sh --configure-only
```

---

## Requirements

- Node.js 18+
- git
- pnpm (`npm install -g pnpm`)
- Claude Code (VS Code extension) and/or Claude desktop app

---

## Setup

### 1. Install the server (above)

The install script will:
- Clone the repo and install dependencies
- Run an interactive onboarding flow — 5 questions to seed your `PERSONA.md` via Haiku
- Register the MCP server with Claude Code and Claude Desktop
- Install `~/.claude/rules/zug.md` (activates Zug in every Claude Code session)
- Link `zug` as a global CLI command

If `PERSONA.md` already exists with real content, onboarding is skipped automatically.

### 2. Add the system prompt to Claude

**Claude Code CLI** (recommended):
- The session gates are automatically active via `~/.claude/rules/zug.md`
- No further action needed — Zug calls `zug_get_context` automatically at every session start

**Claude Desktop** (remote/HTTP mode):
- Run `install.sh --configure-http <url> <token>` to configure the `mcp-remote` proxy
- Create a new Project in Claude Desktop called "Zug"
- Go to Project Settings → paste the contents of `prompts/system-prompt-desktop.md`

**Claude.ai web** (OAuth):
- Deploy the HTTP server (see fly.io section below)
- Go to Claude.ai Settings → Integrations → Add integration
- Enter your server URL — Claude.ai handles the OAuth flow automatically

### 3. Restart Claude

The MCP server starts automatically when Claude connects. You'll see Zug tools available in your session.

---

## How It Works

```
Session start
  └── Claude calls zug_get_context()
  └── Your PERSONA.md + PLAYBOOK.md + active patterns loaded into context

During session
  └── Claude calls zug_save_observation() when it notices something
  └── Stored in observations.jsonl with type, confidence, session_id

Session end
  └── Claude calls zug_end_session() with a summary
  └── Session log written to ~/.zug/sessions/ immediately
  └── Observations appended to PERSONA.md immediately (fallback)
  └── Haiku synthesis runs in background — rewrites PERSONA/PLAYBOOK/ACTIVE if successful

Next session
  └── zug_get_context() loads the updated fingerprint
  └── The relationship continues where it left off
```

---

## Synthesis

When a session ends, Zug immediately appends new observations to `PERSONA.md`, then kicks off a background call to Claude Haiku to intelligently rewrite `PERSONA.md`, `PLAYBOOK.md`, and `ACTIVE.md` — integrating new observations into existing sections rather than appending dated entries.

If synthesis succeeds, it overwrites the appended entries with the integrated version. If it fails or times out, the raw append remains as the fallback.

Requires an API key at `~/.zug/.env`:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > ~/.zug/.env
```

Cost: ~$0.001–0.003 per session end in Haiku tokens.

---

## HTTP Server (fly.io)

For Claude.ai web and multi-machine sync, deploy the HTTP server:

```bash
fly launch   # first time
fly deploy   # subsequent deploys
```

Set the following secrets:
```bash
fly secrets set ZUG_TOKEN=your-secret-token
```

The fly.toml already configures:
- Persistent volume at `/data/.zug/` mapped via `ZUG_DATA_DIR`
- Auto-sleep when idle, auto-wake on request
- `ZUG_URL` for OAuth issuer metadata (set to your fly app URL)

Configure clients for HTTP:
```bash
./install.sh --configure-http https://your-app.fly.dev your-secret-token
```

---

## Merging Data from Another Machine

```bash
cd ~/.zug/server
pnpm merge ~/path/to/external-zug-dir
```

This will:
1. **observations.jsonl** — deduplicate by timestamp+text, merge, sort chronologically
2. **sessions/** — copy any session files that don't already exist locally
3. **PERSONA.md + PLAYBOOK.md** — call Haiku to synthesize both versions into one unified fingerprint (backs up originals before overwriting)

---

## Phases

See [ROADMAP.md](ROADMAP.md) for the full development plan.

| Phase | Status | What it adds |
|---|---|---|
| 1 — Local stdio | ✅ Done | Claude Code gets persistent memory |
| 2 — Haiku synthesis | ✅ Done | AI synthesizes PERSONA/PLAYBOOK from session data |
| 3 — HTTP + fly.io | ✅ Done | All Claude surfaces share memory via remote server |
| 4 — Polish | ✅ Done | OAuth, onboarding, CLI, tests, Linux support |
| 5 — Session Fidelity | 📋 Next | Rules injection, PreCompact hook, delta start, observation reinforcement |

---

## Data Privacy

All data stays on your machine at `~/.zug/`. Nothing is sent anywhere unless you set up the HTTP server (Phase 3), at which point you control your own server and hosting. The only external calls are synthesis requests to the Anthropic API using your own API key.

---

## Philosophy

> "Either a chavruta or death" — Babylonian Talmud

The havruta tradition holds that learning alone is insufficient. You need a partner who challenges your thinking, holds you accountable, and grows with you over time. Zug is the infrastructure for that kind of relationship with an AI — not a tutor that explains, but a pair that thinks alongside you.

The long-term goal: you start asking the questions Zug would have asked. That's when the relationship has changed you permanently.

---

## Contributing

Built for personal use first, extensible by design. PRs welcome — especially for Phase 5 (session fidelity) and Phase 6 (advanced persistence).
