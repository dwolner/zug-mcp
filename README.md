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

## Deploy a remote server (claude.ai web + multi-machine sync)

A deployed HTTPS server does two jobs: it lets **claude.ai web** connect over OAuth, and it acts as the **canonical sync hub** so every machine you use shares one fingerprint (see [Multi-machine sync](#multi-machine-sync)). Zug ships a ready-to-deploy `fly.toml` and `Dockerfile` — the fastest path is [fly.io](https://fly.io).

**Prerequisites:** [flyctl](https://fly.io/docs/flyctl/install/) installed, a fly.io account.

```bash
# 1. Clone the repo (or use your npm-installed copy)
git clone https://github.com/dwolner/zug-mcp && cd zug-mcp

# 2. Create the app (picks up fly.toml — do not deploy yet)
fly launch --no-deploy

# 3. Create a persistent volume for your data
fly volumes create zug_data --size 1

# 4. Set secrets
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  ZUG_URL=https://<your-app-name>.fly.dev \
  ZUG_TOKEN=$(openssl rand -hex 32)

# 5. Deploy
fly deploy
```

- `ANTHROPIC_API_KEY` — server-side synthesis of PERSONA/PLAYBOOK.
- `ZUG_URL` — your public base URL, also the OAuth issuer.
- `ZUG_TOKEN` — the bearer token your CLI machines sync with. **Save it** — each machine needs the same value.

Your server is now live at `https://<your-app-name>.fly.dev`.

The shipped `fly.toml` sets `ZUG_CANONICAL=1` and runs **always-on** (`auto_stop_machines = 'off'`, `min_machines_running = 1`). That makes the server the durable canonical store: it holds the merged logs and runs synthesis, so a client losing connectivity degrades to "sync paused" rather than failing. If you only use claude.ai web and don't need always-on durability, you can switch to scale-to-zero (`min_machines_running = 0`, `auto_stop_machines = 'stop'`) to cut idle cost — the first request after idle then pays a ~2s cold start.

**Connect claude.ai:**

1. Open [claude.ai](https://claude.ai) → Settings → Integrations
2. Add MCP server URL: `https://<your-app-name>.fly.dev`
3. Authorize — Zug handles the OAuth flow automatically

**Persistence:** All data is written to the `/data/.zug` volume mount and survives restarts and redeploys.

**Update:**

```bash
fly deploy  # redeploy after pulling latest changes
```

## Multi-machine sync

Run Zug on more than one machine (e.g. two laptops) and keep a single, unified cognitive fingerprint across all of them. A fs-capable client (Claude Code CLI, desktop) writes locally on the hot path and syncs to the canonical server in the background.

**Three modes**, chosen automatically:

| Mode | When | Behavior |
|------|------|----------|
| `local-only` | No `ZUG_URL`/`ZUG_TOKEN` configured (default) | Everything stays on this machine. Synthesis runs locally if `ANTHROPIC_API_KEY` is set, else append-only. |
| `synced` | `ZUG_URL` + `ZUG_TOKEN` resolvable on an fs client | Writes locally, pushes raw logs to the canonical server, pulls the one authoritative PERSONA/PLAYBOOK/ACTIVE. |
| `canonical` | `ZUG_CANONICAL=1` (the deployed server) | Holds the merged append-only logs and runs synthesis for everyone. |

**Add a machine to your sync** (after [deploying a server](#deploy-a-remote-server-claudeai-web--multi-machine-sync)):

```bash
# 1. Install
npm install -g zug-mcp

# 2. Point it at your canonical server — the token must match the server's ZUG_TOKEN
mkdir -p ~/.zug && cat > ~/.zug/config <<EOF
ZUG_URL=https://<your-app-name>.fly.dev
ZUG_TOKEN=<the same token you set on the server>
EOF

# 3. Register MCP server + sync hooks, then restart your agent
zug setup

# 4. Verify
zug pull        # → {"status":"ok"} and your canonical PERSONA.md appears
```

**What syncs:** observations, sessions, growth, lessons, and reinforcements push to the server, which merges them and re-synthesizes. PERSONA/PLAYBOOK/ACTIVE are **pulled only, never pushed** — they're regenerated server-side from the merged log so there's exactly one authoritative fingerprint. Synthesis happens on the server (on push), so a synced client does **not** need its own `ANTHROPIC_API_KEY`.

**How it's driven (Claude Code):** `zug setup` registers hooks — `SessionStart` pulls on cold start (and reloads on compaction), `SessionEnd` pushes. You can also run `zug sync` / `zug pull` / `zug push` manually.

**Graceful degradation:** if the server is unreachable, sync is marked `paused` in `~/.zug/sync-state.json` and the session keeps working locally — it reconciles automatically on the next successful sync. A server outage never blocks a session.

**Per-machine identity:** each install generates its own `~/.zug/source-id` (drives per-source push/pull cursors and collision-free lesson IDs). Don't copy `source-id` or `sync-state.json` between machines — let each generate its own.

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
zug onboard         Seed your cognitive fingerprint (ANTHROPIC_API_KEY optional, improves output)
zug sync            Pull then push against the canonical server (synced mode)
zug pull            Pull canonical PERSONA/PLAYBOOK/ACTIVE + merged logs from the server
zug push            Push local observations/sessions/lessons to the server
zug resume          Reload context after a compaction (SessionStart compaction hook)
zug compact         Durability push before compaction (PreCompact hook)
zug archive         Move sessions older than 90 days to sessions/archive (local-only)
zug backup          Back up your data directory
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
  sessions/           Per-session logs (sessions/archive/ for >90-day-old logs)
  lessons.jsonl       Named behavioral rules
  growth.jsonl        Growth snapshots (appended on session end)
  config              ZUG_URL / ZUG_TOKEN for synced mode (optional)
  source-id           Per-install identity for sync (auto-generated)
  sync-state.json     Sync cursors + status (synced mode; auto-generated)
```

No database. Plain files you can read, back up, or delete. In [synced mode](#multi-machine-sync) the canonical fingerprint lives on a persistent Fly volume and is shared across all your machines; the local copy is a working mirror.

## Configuration

Sync-related variables are read from the environment **or** from `~/.zug/config`.

| Variable | Default | Description |
|----------|---------|-------------|
| `ZUG_DATA_DIR` | `~/.zug` | Override the data directory location |
| `ZUG_URL` | `http://localhost:PORT` | On the server: public HTTPS base URL + OAuth issuer. On a client: the canonical server to sync with (enables `synced` mode together with `ZUG_TOKEN`). |
| `ZUG_TOKEN` | — | Bearer token shared between the canonical server and its synced CLI clients — must match on both. Required for sync; the server warns at startup if unset. |
| `ZUG_CANONICAL` | — | Set to `1` on the deployed server to make it the canonical sync hub (holds merged logs, runs synthesis). Set in the shipped `fly.toml`. |
| `ZUG_SYNC_URL` | — | Optional override for the sync target; takes precedence over `ZUG_URL` when resolving the canonical server. |
| `ANTHROPIC_API_KEY` | — | Enables Haiku synthesis (PERSONA/PLAYBOOK rewrite). Needed where synthesis runs — the canonical server, or a `local-only` machine. **Not** needed on `synced` clients. Without it on a synthesizing node, PERSONA.md grows unboundedly. |
| `PORT` | `8080` | HTTP server port |

## License

MIT — see [LICENSE](./LICENSE).

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
