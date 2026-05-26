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
| claude.ai web | Via HTTP | Requires a deployed HTTP server. OAuth handled automatically by the server. |
| Cursor | Best-effort | MCP config written. No automatic rule injection — add the rule manually if needed. |
| Windsurf | Best-effort | MCP config written. Manual rule setup required. |

Claude Code is the primary target. Other agents receive MCP connectivity but lack the automatic session gate behavior.

## Deploy for claude.ai (HTTP Transport)

claude.ai web connects to MCP servers over HTTP and requires a publicly accessible HTTPS URL. Zug ships a ready-to-deploy `fly.toml` and `Dockerfile` — the fastest path is [fly.io](https://fly.io).

**Prerequisites:** [flyctl](https://fly.io/docs/flyctl/install/) installed, free fly.io account.

```bash
# 1. Clone the repo (or use your npm-installed copy)
git clone https://github.com/dwolner/zug-mcp && cd zug-mcp

# 2. Create the app (picks up fly.toml — do not deploy yet)
fly launch --no-deploy

# 3. Create a persistent volume for your data
fly volumes create zug_data --size 1

# 4. Set required secrets
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  ZUG_URL=https://<your-app-name>.fly.dev

# 5. Deploy
fly deploy
```

Your server is now live at `https://<your-app-name>.fly.dev`.

**Connect claude.ai:**

1. Open [claude.ai](https://claude.ai) → Settings → Integrations
2. Add MCP server URL: `https://<your-app-name>.fly.dev`
3. Authorize — Zug handles the OAuth flow automatically

**Persistence:** All data is written to the `/data/.zug` volume mount and survives restarts and redeploys.

**Sleep behavior:** The default `fly.toml` uses `auto_stop_machines = 'stop'` (free tier). The first request after idle wakes the machine in ~2s; subsequent requests are instant.

**Update:**

```bash
fly deploy  # redeploy after pulling latest changes
```

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
zug onboard         Seed your cognitive fingerprint (ANTHROPIC_API_KEY optional, improves output)
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

No database. Plain files you can read, back up, or delete. HTTP/Fly users get remote storage on a persistent Fly volume, synced across machines automatically.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ZUG_DATA_DIR` | `~/.zug` | Override the data directory location |
| `ZUG_URL` | `http://localhost:PORT` | Public HTTPS base URL — required for HTTP transport; used as OAuth issuer |
| `ANTHROPIC_API_KEY` | — | Enables Haiku background synthesis (PERSONA/PLAYBOOK rewrite) |
| `PORT` | `8080` | HTTP server port |
| `ZUG_TOKEN` | — | Optional bearer token for legacy non-OAuth clients (curl, scripts) |

## License

MIT — see [LICENSE](./LICENSE).

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
