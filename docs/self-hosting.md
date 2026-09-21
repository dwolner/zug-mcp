<!-- Moved out of README.md 2026-09-21. Zug Pro is the hosted version of exactly
this. Keeping the instructions is deliberate: fly.toml and Dockerfile ship in
the repo under MIT, so the capability is visible either way, and documenting it
is more honest than leaving people to reverse-engineer it. It just does not
belong in the README's main flow. -->

# Self-hosting Zug

A deployed HTTPS server does two jobs: it lets **claude.ai web** connect over OAuth, and it acts as the **canonical sync hub** so every machine you use shares one persona (see [Multi-machine sync](../README.md#multi-machine-sync)). Zug ships a ready-to-deploy `fly.toml` and `Dockerfile` — the fastest path is [fly.io](https://fly.io).

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

## Or do not

Zug Pro is this, run for you: sync across machines, synthesis on our servers
rather than your laptop, claude.ai in the browser, and a dashboard showing what
Zug has worked out about you. $5 a month. Local Zug stays free and complete
either way.
