# Zug — Persistent Memory for Your AI Learning Companion

**Zug** (Hebrew: "pair") is an MCP server that gives Claude persistent memory across sessions — building a cognitive fingerprint of how you think, where you get stuck, what excites you, and how you grow over time.

It's built around the Jewish concept of *havruta*: the idea that learning alongside a partner produces something neither could reach alone. Zug is the infrastructure that makes that long-term relationship possible.

---

## What It Does

Zug exposes five tools Claude can call during any session:

| Tool | When it's called |
|---|---|
| `zug_get_context` | Session start — loads your cognitive fingerprint and playbook |
| `zug_save_observation` | Mid-session — saves a pattern, preference, breakthrough, or mistake |
| `zug_end_session` | Session end — writes the session log, updates your fingerprint |
| `zug_get_recent_sessions` | After a gap — re-establishes context from past sessions |
| `zug_status` | Anytime — shows session count, observation count, fingerprint size |

Your data lives at `~/.zug/`:
```
~/.zug/
├── PERSONA.md        ← your cognitive fingerprint (grows over time)
├── PLAYBOOK.md       ← what works universally (updated each session)
├── observations.jsonl ← structured observation log
└── sessions/         ← full session logs by date
```

---

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/zug-mcp/main/install.sh | bash
```

Or manually:

```bash
git clone https://github.com/YOUR_USERNAME/zug-mcp ~/.zug/server
cd ~/.zug/server
pnpm install
./install.sh --configure-only
```

---

## Requirements

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Claude Code (VS Code extension) and/or Claude desktop app

---

## Setup

### 1. Install the server (above)

### 2. Seed your persona

Copy the template and fill it in:
```bash
cp ~/.zug/server/templates/PERSONA.template.md ~/.zug/PERSONA.md
```

Edit `~/.zug/PERSONA.md` — write a few paragraphs about how you think. Don't overthink it. Zug will refine it from real sessions. This is just a starting point.

### 3. Add the system prompt to Claude

**Claude.ai Projects** (web + desktop):
- Create a new Project called "Zug" (or anything)
- Go to Project Settings → paste the contents of `prompts/system-prompt.md`

**Claude Code** (VS Code extension):
- The system prompt is automatically active via `~/.claude/rules/zug.md` (installed by the setup script)

### 4. Restart Claude

The MCP server starts automatically when Claude connects. You'll see Zug tools available in your session.

---

## How It Works

```
Session start
  └── Claude calls zug_get_context()
  └── Your PERSONA.md + PLAYBOOK.md are loaded into context

During session
  └── Claude calls zug_save_observation() when it notices something
  └── Stored in observations.jsonl with type, confidence, session_id

Session end
  └── Claude calls zug_end_session() with a summary
  └── Session log written to ~/.zug/sessions/
  └── High-confidence observations appended to PERSONA.md

Next session
  └── zug_get_context() loads the updated fingerprint
  └── The relationship continues where it left off
```

---

## Phases

See [ROADMAP.md](ROADMAP.md) for the full development plan.

| Phase | Status | What it adds |
|---|---|---|
| 1 — Local stdio | ✅ Done | Claude Code gets persistent memory |
| 2 — Haiku synthesis | 🔜 Next | AI rewrites PERSONA/PLAYBOOK from session data |
| 3 — HTTP + tunnel | 📋 Planned | Claude.ai web connects, all surfaces share memory |
| 4 — Polish | 📋 Planned | Auto-start, CLI, trim logic |

---

## Data Privacy

All data stays on your machine at `~/.zug/`. Nothing is sent anywhere unless you set up Phase 3 (HTTP transport), at which point you control your own server and hosting.

---

## Philosophy

> "Either a chavruta or death" — Babylonian Talmud

The havruta tradition holds that learning alone is insufficient. You need a partner who challenges your thinking, holds you accountable, and grows with you over time. Zug is the infrastructure for that kind of relationship with an AI — not a tutor that explains, but a pair that thinks alongside you.

The long-term goal: you start asking the questions Zug would have asked. That's when the relationship has changed you permanently.

---

## Contributing

Built for personal use first, extensible by design. PRs welcome — especially for Phase 2 (Haiku synthesis) and Phase 3 (HTTP transport).
