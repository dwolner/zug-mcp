# Phase 3: HTTP Transport + fly.io Deployment

**Date:** 2026-05-21  
**Status:** Approved  
**Goal:** All Claude surfaces share one persistent Zug memory via a single HTTP server on fly.io.

---

## Architecture

```
Claude Code (laptop 1)  ──┐
Claude Code (laptop 2)  ──┤  HTTPS + X-Zug-Token   ┌─────────────────────────┐
Claude desktop          ──┼────────────────────────▶│  fly.io: zug-mcp        │
Claude.ai web           ──┘                         │  src/http.ts (HTTP/SSE) │
                                                     │  server.ts (MCP tools)  │
                                                     │  storage.ts (file I/O)  │
                                                     └────────────┬────────────┘
                                                                  │ volume mount
                                                                  ▼
                                                         /data/.zug/
                                                         ├── PERSONA.md
                                                         ├── PLAYBOOK.md
                                                         ├── ACTIVE.md
                                                         ├── observations.jsonl
                                                         └── sessions/
```

**Single-tenant.** One token, one data directory, one person's PERSONA. No partitioning.

stdio transport is removed after migration — no local fallback.

---

## New Files

### `src/http.ts`
HTTP/SSE entry point using `SSEServerTransport` from `@modelcontextprotocol/sdk/server/sse.js`.

**Endpoints:**
- `GET /sse` — client connects, opens SSE stream
- `POST /messages` — client sends tool calls

**Auth middleware** (both endpoints):
- Checks `X-Zug-Token` header against `ZUG_TOKEN` env var
- Returns `401` if missing or wrong

**Rate limiting** (in-memory sliding window, no Redis):
- 60 requests/minute per IP
- Returns `429` if exceeded

**Port:** from `PORT` env var (fly.io sets this automatically).

### `Dockerfile`
- Base: `node:22-alpine`
- Install pnpm, copy server files, `pnpm install --frozen-lockfile`
- Entry: `node --import tsx/esm src/http.ts` or compiled output

### `fly.toml`
- App name: `zug-mcp`
- Volume mount: `/data/.zug/` → `zug_data` volume
- Internal port: `8080`
- Free tier: `shared-cpu-1x`, 256MB RAM

### `src/migrate.ts` (one-time script)
- Uses `fly sftp shell` or `fly ssh sftp` to upload local `~/.zug/` data files to the volume
- Uploads: `PERSONA.md`, `PLAYBOOK.md`, `ACTIVE.md`, `observations.jsonl`, `sessions/`
- Run once after first deploy

---

## Modified Files

### `src/storage.ts`
- `ZUG_DIR` reads from `ZUG_DATA_DIR` env var, defaults to `~/.zug/`
- No other changes — file I/O stays identical

### `install.sh`
- New mode: `--configure-http <url> <token>`
  - Writes HTTP MCP entry to `~/.claude.json` (Claude Code)
  - Writes HTTP MCP entry to `claude_desktop_config.json` (Claude desktop)
  - Removes stdio MCP entry from both
- Existing `--configure-only` mode unchanged (still writes stdio config for local dev)

### `package.json`
- Add `"migrate": "tsx src/migrate.ts"` script
- Add `"start:http": "tsx src/http.ts"` script

### `ROADMAP.md`
- Mark Phase 3 as ✅ after deploy
- Add free-tier cold start upgrade note to Phase 4

---

## fly.io Secrets

| Secret | Value |
|--------|-------|
| `ZUG_TOKEN` | New shared secret (treat like a password) |
| `ANTHROPIC_API_KEY` | New key created for the server |
| `ZUG_DATA_DIR` | `/data/.zug` |

---

## Deployment Flow

1. `fly launch` — creates app, provisions free machine
2. `fly volumes create zug_data --size 1` — 1GB persistent volume
3. `fly secrets set ZUG_TOKEN=<token> ANTHROPIC_API_KEY=<key> ZUG_DATA_DIR=/data/.zug`
4. `fly deploy` — builds Docker image, starts server
5. `pnpm migrate` — uploads local `~/.zug/` data to volume
6. On each machine: `./install.sh --configure-http https://zug-mcp.fly.dev <token>`
7. Claude.ai web: add `https://zug-mcp.fly.dev/sse` in Settings → Integrations → MCP

---

## Security Notes

- Token is encrypted in transit (fly.io HTTPS)
- Token lives in `~/.claude.json` on each machine — treat as a credential, never commit to git
- fly.io has access to volume data (infrastructure trust)
- Rate limiting catches token-leak abuse, not a security boundary
- Token rotation: manual (`fly secrets set ZUG_TOKEN=<new>` + re-run install on each machine)

---

## Out of Scope

- Multi-tenant / user partitioning (Phase 4 / Future)
- stdio fallback (removed intentionally — single source of truth)
- Automatic token rotation
- fly.io paid tier upgrade (revisit when cold starts become a problem)
