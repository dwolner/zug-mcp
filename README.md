# zug-mcp

**The memory and reflection layer for people who work with AI.**

Observations. Patterns. Lessons. Growth — across every session, every agent.

---

Zug (Hebrew: "pair") is an MCP server that gives your AI a persistent cognitive fingerprint of you — how you think, what you care about, where you get stuck, and how you grow. Built around the Jewish concept of *havruta*: learning alongside a partner produces something neither could reach alone.

## Install

```bash
npm install -g zug-mcp
zug setup
```

`zug setup` auto-detects your installed agent clients and writes the MCP config to each. Restart your agent to connect.

## What It Does

Every session, Zug builds a richer picture of who you are as a thinker. It stores observations about your reasoning patterns, cognitive preferences, and growth moments. At the start of each session, it surfaces the most relevant context so your AI partner can calibrate — without you having to re-explain yourself.

Over time: a cognitive fingerprint that makes every session smarter than the last.

## Agent Support

| Agent | Support tier | Notes |
|-------|-------------|-------|
| Claude Code | First-class | Full rule injection via `~/.claude/rules/zug.md`. Hooks auto-run context at session start. |
| Cursor | Best-effort | MCP config written. No automatic rule injection — add the rule manually if needed. |
| Windsurf | Best-effort | MCP config written. Manual rule setup required. |

Claude Code is the primary target. Other agents receive MCP connectivity but lack the automatic session gate behavior.

## CLI

```
zug status          Show sessions, observations, config status, and data dir size
zug setup           Auto-detect agents and write MCP configs
  --claude-code     Configure Claude Code only
  --cursor          Configure Cursor only
  --windsurf        Configure Windsurf only
  --all             Configure all agents
zug update          Update zug-mcp to latest (runs npm install -g)
zug tail [n]        Show recent observations (default: 10)
zug persona         Print full PERSONA.md
zug compact         Print pre-compaction checkpoint (used by PreCompact hook)
```

## MCP Tools

Your AI calls these automatically. You can also call them manually.

**Context & Memory**

| Tool | What it does |
|------|-------------|
| `zug_get_context` | Load cognitive fingerprint, playbook, and active patterns. Call at session start. |
| `zug_status` | Stats snapshot: sessions, observations, weekly trend. |
| `zug_get_recent_sessions` | Re-establish context after a gap or compaction. |

**Observations**

| Tool | What it does |
|------|-------------|
| `zug_save_observation` | Record a pattern, preference, breakthrough, or correction. |
| `zug_reinforce_observation` | Mark a pattern as recurring — increases its weight in future context. |

**Sessions**

| Tool | What it does |
|------|-------------|
| `zug_end_session` | Write session log and trigger background synthesis. Call at session end. |

**Lessons**

| Tool | What it does |
|------|-------------|
| `zug_create_lesson` | Promote a reinforced pattern to a named behavioral rule. |
| `zug_lesson_digest` | Ranked list of active lessons — loaded with context. |
| `zug_lesson_update` | Edit, deprecate, or supersede a lesson. |
| `zug_reinforce_lesson` | Increment reinforcement count when a lesson proves true again. |

**Socratic Threads**

| Tool | What it does |
|------|-------------|
| `zug_open_thread` | Start tracking an open question in a havruta exchange. |
| `zug_close_thread` | Resolve or explicitly defer an open thread. |
| `zug_get_open_thread` | Surface the current unresolved thread. |

**Analysis & Growth**

| Tool | What it does |
|------|-------------|
| `zug_reasoning_analysis` | 6-lens parallel reasoning review via Haiku (~$0.006/call). |
| `zug_growth_summary` | Observation trend and persona growth metrics over time. |

## Data Directory

All data lives in `~/.zug/` (or `$ZUG_DATA_DIR`):

```
~/.zug/
  PERSONA.md          Cognitive fingerprint — how you think, what excites you
  PLAYBOOK.md         Universal session patterns — what works
  ACTIVE.md           Current behavioral frame (active patterns)
  observations.jsonl  Append-only observation log
  sessions/           Per-session logs
  lessons.json        Named behavioral rules
  growth.jsonl        Growth snapshots (appended on session end)
```

No database. No cloud sync. Plain files you can read, back up, or delete.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ZUG_DATA_DIR` | `~/.zug` | Override the data directory location |

## License

MIT — see [LICENSE](./LICENSE).

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
