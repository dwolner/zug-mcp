# Phase 3: HTTP Transport + fly.io Deployment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Zug as an always-on HTTP MCP server on fly.io so all Claude surfaces (Claude Code, Claude desktop, Claude.ai web) share one persistent memory.

**Architecture:** A single `src/http.ts` entry point wraps the existing `server.ts` MCP tools behind a Node.js HTTP server using `StreamableHTTPServerTransport`. Data lives on a fly.io persistent volume at `/data/.zug/`. All clients authenticate via `X-Zug-Token` header. stdio transport is retired.

**Tech Stack:** Node.js 22, `@modelcontextprotocol/sdk` StreamableHTTPServerTransport, fly.io free tier, persistent volume, Docker

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/storage.ts` | Read `ZUG_DATA_DIR` env var for data directory |
| Create | `src/rate-limit.ts` | In-memory sliding window rate limiter |
| Create | `src/http.ts` | HTTP server: auth, rate limiting, MCP transport |
| Create | `Dockerfile` | Build + runtime image |
| Create | `.dockerignore` | Exclude node_modules, .git, dist |
| Create | `fly.toml` | fly.io app config + volume mount |
| Create | `scripts/migrate.sh` | One-time upload of local `~/.zug/` to fly volume |
| Modify | `package.json` | Add `start:http` and `migrate` scripts |
| Modify | `install.sh` | Add `--configure-http <url> <token>` mode |
| Modify | `ROADMAP.md` | Mark Phase 3 complete, note paid-tier upgrade path |

---

## Task 1: Update storage.ts — ZUG_DATA_DIR support

**Files:**
- Modify: `src/storage.ts:6-9`

- [ ] **Step 1: Update ZUG_DIR to read from env var**

Replace the top constants block:

```typescript
const ZUG_DIR = process.env.ZUG_DATA_DIR || path.join(os.homedir(), ".zug");
const SESSIONS_DIR = path.join(ZUG_DIR, "sessions");
const PERSONA_FILE = path.join(ZUG_DIR, "PERSONA.md");
const PLAYBOOK_FILE = path.join(ZUG_DIR, "PLAYBOOK.md");
const OBSERVATIONS_FILE = path.join(ZUG_DIR, "observations.jsonl");
const ACTIVE_FILE = path.join(ZUG_DIR, "ACTIVE.md");
```

- [ ] **Step 2: Verify local dev still works**

```bash
cd ~/.zug/server
npx tsx src/stdio.ts &
sleep 1 && kill %1
echo "Exit code: $?"
```

Expected: server starts without error, exits cleanly.

- [ ] **Step 3: Commit**

```bash
cd ~/.zug/server
git add src/storage.ts
git commit -m "feat: read ZUG_DATA_DIR env var for data directory"
```

---

## Task 2: Create src/rate-limit.ts

**Files:**
- Create: `src/rate-limit.ts`

- [ ] **Step 1: Create the file**

```typescript
const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX = 60;

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX) return true;
  hits.push(now);
  buckets.set(ip, hits);
  return false;
}
```

- [ ] **Step 2: Smoke test**

```bash
cd ~/.zug/server
npx tsx -e "
import { isRateLimited } from './src/rate-limit.js';
for (let i = 0; i < 60; i++) isRateLimited('test');
console.log('60th:', isRateLimited('test'));
console.log('61st:', isRateLimited('test'));
"
```

Expected output:
```
60th: false
61st: true
```

- [ ] **Step 3: Commit**

```bash
git add src/rate-limit.ts
git commit -m "feat: add in-memory sliding window rate limiter (60 req/min)"
```

---

## Task 3: Create src/http.ts

**Files:**
- Create: `src/http.ts`

- [ ] **Step 1: Create the file**

```typescript
import http from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { isRateLimited } from "./rate-limit.js";

const ZUG_TOKEN = process.env.ZUG_TOKEN;
const PORT = parseInt(process.env.PORT || "8080", 10);

if (!ZUG_TOKEN) {
  console.error("ZUG_TOKEN env var is required");
  process.exit(1);
}

const transports = new Map<string, StreamableHTTPServerTransport>();

function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

async function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Auth
  const token = req.headers["x-zug-token"];
  if (token !== ZUG_TOKEN) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Rate limit
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Too Many Requests" }));
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost`);
  if (url.pathname !== "/mcp") {
    res.writeHead(404);
    res.end();
    return;
  }

  let body: unknown;
  if (req.method === "POST") {
    body = await parseJsonBody(req);
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "POST" && !sessionId) {
    // New session: create transport + server
    // eslint-disable-next-line prefer-const
    let sessionTransport!: StreamableHTTPServerTransport;
    sessionTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, sessionTransport);
        sessionTransport.onclose = () => transports.delete(id);
      },
    });
    const mcpServer = createServer();
    await mcpServer.connect(sessionTransport);
    await sessionTransport.handleRequest(req, res, body);
  } else if (sessionId) {
    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    await transport.handleRequest(req, res, body);
  } else {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing Mcp-Session-Id header" }));
  }
});

server.listen(PORT, () => {
  console.log(`Zug MCP HTTP server listening on port ${PORT}`);
});
```

- [ ] **Step 2: Smoke test — server starts**

```bash
ZUG_TOKEN=test123 PORT=8787 npx tsx src/http.ts &
sleep 1

# Auth check — should 401
curl -s http://localhost:8787/mcp -X POST | cat

# Token check — should get MCP response or 400 (no session yet)
curl -s http://localhost:8787/mcp \
  -X POST \
  -H "X-Zug-Token: test123" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' | cat

kill %1
```

Expected: first curl returns `{"error":"Unauthorized"}`, second returns a JSON response with `result.serverInfo.name = "zug"`.

- [ ] **Step 3: Commit**

```bash
git add src/http.ts
git commit -m "feat: add HTTP/SSE MCP server with auth and rate limiting"
```

---

## Task 4: Add Dockerfile and .dockerignore

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build
CMD ["node", "dist/http.js"]
```

- [ ] **Step 2: Create .dockerignore**

```
node_modules
dist
.git
*.md
docs/
scripts/
templates/
prompts/
```

- [ ] **Step 3: Verify build locally**

```bash
cd ~/.zug/server
docker build -t zug-mcp-test .
docker run --rm -e ZUG_TOKEN=test -e PORT=8080 -p 8080:8080 zug-mcp-test &
sleep 2
curl -s http://localhost:8080/mcp -X POST | cat
# Expected: {"error":"Unauthorized"}
docker stop $(docker ps -q --filter ancestor=zug-mcp-test)
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add Dockerfile for fly.io deployment"
```

---

## Task 5: Add fly.toml

**Files:**
- Create: `fly.toml`

- [ ] **Step 1: Create fly.toml**

```toml
app = "zug-mcp"
primary_region = "iad"

[build]

[env]
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[mounts]]
  source = "zug_data"
  destination = "/data/.zug"
```

`auto_stop_machines = "stop"` + `min_machines_running = 0` = free tier sleep/wake behavior. Cold starts are acceptable per design.

- [ ] **Step 2: Commit**

```bash
git add fly.toml
git commit -m "feat: add fly.toml for fly.io deployment"
```

---

## Task 6: Create scripts/migrate.sh

**Files:**
- Create: `scripts/migrate.sh`

- [ ] **Step 1: Create the script**

```bash
mkdir -p ~/.zug/server/scripts
```

```bash
#!/usr/bin/env bash
# One-time migration: uploads local ~/.zug/ data to the fly.io persistent volume.
# Run once after first deploy. Safe to re-run (overwrites existing files).
set -e

APP="${FLY_APP:-zug-mcp}"
ZUG_DIR="$HOME/.zug"
REMOTE="/data/.zug"

echo "[migrate] App: $APP"
echo "[migrate] Source: $ZUG_DIR"
echo "[migrate] Destination: $REMOTE"
echo ""

# Build SFTP batch file
BATCH=$(mktemp)
trap "rm -f $BATCH" EXIT

# Create remote directories (- prefix ignores "already exists" errors)
cat >> "$BATCH" << EOF
-mkdir $REMOTE
-mkdir $REMOTE/sessions
EOF

# Upload top-level data files
for file in PERSONA.md PLAYBOOK.md ACTIVE.md observations.jsonl; do
  local="$ZUG_DIR/$file"
  if [ -f "$local" ]; then
    echo "put $local $REMOTE/$file" >> "$BATCH"
    echo "[migrate] Queued: $file"
  fi
done

# Upload session files
SESSION_COUNT=0
for f in "$ZUG_DIR/sessions/"*.md; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  echo "put $f $REMOTE/sessions/$base" >> "$BATCH"
  SESSION_COUNT=$((SESSION_COUNT + 1))
done
echo "[migrate] Queued: $SESSION_COUNT session files"

echo "bye" >> "$BATCH"
echo ""

echo "[migrate] Uploading via fly sftp..."
fly sftp shell -a "$APP" < "$BATCH"

echo ""
echo "[migrate] Done. Verify with:"
echo "  fly ssh console -a $APP -C 'ls -la $REMOTE'"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x ~/.zug/server/scripts/migrate.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate.sh
git commit -m "feat: add one-time data migration script for fly.io volume"
```

---

## Task 7: Update package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add new scripts**

In `package.json`, update the `scripts` block to:

```json
"scripts": {
  "build": "tsc",
  "dev": "tsx src/stdio.ts",
  "start:http": "node dist/http.js",
  "typecheck": "tsc --noEmit",
  "merge": "tsx src/merge.ts",
  "synthesize": "tsx src/synthesize-cli.ts",
  "migrate": "bash scripts/migrate.sh"
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/.zug/server
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add start:http and migrate scripts"
```

---

## Task 8: Update install.sh — add --configure-http mode

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Add --configure-http block after the existing Claude Code config section**

Find the line `# ── Register with Claude Code (~/.claude.json) ────` and add the following new block immediately before it (before the existing stdio config block):

```bash
# ── HTTP mode: configure all clients for remote fly.io server ────────────────
if [[ "$1" == "--configure-http" ]]; then
  HTTP_URL="$2"
  HTTP_TOKEN="$3"

  if [[ -z "$HTTP_URL" || -z "$HTTP_TOKEN" ]]; then
    echo "Usage: install.sh --configure-http <url> <token>"
    echo "Example: install.sh --configure-http https://zug-mcp.fly.dev test-token-abc"
    exit 1
  fi

  info "Configuring clients for HTTP transport: $HTTP_URL"

  # Claude Code (~/.claude.json)
  CLAUDE_JSON="$HOME/.claude.json"
  if [[ -f "$CLAUDE_JSON" ]]; then
    python3 - "$CLAUDE_JSON" "$HTTP_URL" "$HTTP_TOKEN" << 'PYEOF'
import json, sys
path, url, token = sys.argv[1], sys.argv[2], sys.argv[3]
config = json.load(open(path))
config.setdefault("mcpServers", {})["zug"] = {
  "type": "http",
  "url": f"{url}/mcp",
  "headers": { "X-Zug-Token": token }
}
json.dump(config, open(path, "w"), indent=2)
PYEOF
    success "Claude Code configured for HTTP ($CLAUDE_JSON)"
  else
    warn "~/.claude.json not found — skipping Claude Code config"
  fi

  # Claude desktop
  if [[ -n "$CLAUDE_DESKTOP" && -f "$CLAUDE_DESKTOP" ]]; then
    python3 - "$CLAUDE_DESKTOP" "$HTTP_URL" "$HTTP_TOKEN" << 'PYEOF'
import json, sys
path, url, token = sys.argv[1], sys.argv[2], sys.argv[3]
config = json.load(open(path))
config.setdefault("mcpServers", {})["zug"] = {
  "type": "http",
  "url": f"{url}/mcp",
  "headers": { "X-Zug-Token": token }
}
json.dump(config, open(path, "w"), indent=2)
PYEOF
    success "Claude desktop configured for HTTP ($CLAUDE_DESKTOP)"
  else
    warn "Claude desktop config not found — skipping"
  fi

  echo ""
  success "HTTP configuration complete!"
  echo ""
  echo "Restart Claude Code and Claude desktop to pick up the changes."
  echo ""
  echo "For Claude.ai web: Settings → Integrations → Add MCP Server"
  echo "  URL:   $HTTP_URL/mcp"
  echo "  Token: (paste your ZUG_TOKEN when prompted, or add X-Zug-Token header)"
  echo ""
  exit 0
fi
```

- [ ] **Step 2: Verify the script syntax**

```bash
bash -n ~/.zug/server/install.sh
```

Expected: no output (no syntax errors).

- [ ] **Step 3: Dry-run test**

```bash
# Simulate --configure-http call (won't modify anything since ~/.claude.json path is checked)
bash ~/.zug/server/install.sh --configure-http https://zug-mcp.fly.dev badtoken 2>&1 | head -20
```

Expected: prints "Configuring clients for HTTP transport" and either success or "not found" messages.

- [ ] **Step 4: Commit**

```bash
git add install.sh
git commit -m "feat: add --configure-http mode to install.sh"
```

---

## Task 9: Update ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark Phase 3 complete and add cold-start upgrade note**

Change the `## Phase 3` heading line from:

```markdown
## Phase 3 — HTTP Transport + Claude.ai Web 📋
```

To:

```markdown
## Phase 3 — HTTP Transport + Claude.ai Web ✅
```

Add this note at the end of the Phase 3 section, before the `---` separator:

```markdown
**Note:** Deployed on fly.io free tier (machines sleep after inactivity, cold start ~2-3s on first request). Upgrade to paid `shared-cpu-1x` with `min_machines_running = 1` when cold starts become disruptive — see Phase 4.
```

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark Phase 3 complete, note cold-start upgrade path"
```

---

## Task 10: Push to GitHub

- [ ] **Step 1: Push all commits**

```bash
cd ~/.zug/server
git push origin main
```

---

## Task 11: Deploy to fly.io

> Requires `flyctl` installed: `brew install flyctl` + `fly auth login`

- [ ] **Step 1: Create fly.io app**

```bash
cd ~/.zug/server
fly launch --no-deploy --name zug-mcp --region iad
```

When prompted "would you like to copy its configuration to the new app?" — say **no** (we have our own `fly.toml`).

- [ ] **Step 2: Create persistent volume**

```bash
fly volumes create zug_data --size 1 --region iad -a zug-mcp
```

Expected: `ID: vol_xxxxxxxx ... state: created`

- [ ] **Step 3: Set secrets**

Generate a strong token:
```bash
openssl rand -hex 32
```

Set secrets (replace values):
```bash
fly secrets set \
  ZUG_TOKEN=<paste-generated-token> \
  ANTHROPIC_API_KEY=<new-anthropic-api-key> \
  ZUG_DATA_DIR=/data/.zug \
  -a zug-mcp
```

Save the `ZUG_TOKEN` value — you'll need it for client configuration.

- [ ] **Step 4: Deploy**

```bash
fly deploy -a zug-mcp
```

Expected: build completes, machine starts, health checks pass.

- [ ] **Step 5: Verify server is running**

```bash
curl -s https://zug-mcp.fly.dev/mcp -X POST | cat
```

Expected: `{"error":"Unauthorized"}` — server is up and auth is working.

- [ ] **Step 6: Migrate data**

```bash
cd ~/.zug/server
pnpm migrate
```

Expected: files uploaded, ends with "Done."

Verify:
```bash
fly ssh console -a zug-mcp -C "ls -la /data/.zug/"
```

Expected: PERSONA.md, PLAYBOOK.md, ACTIVE.md, observations.jsonl, sessions/ all present.

---

## Task 12: Configure clients

- [ ] **Step 1: Configure this machine (primary laptop)**

```bash
~/.zug/server/install.sh --configure-http https://zug-mcp.fly.dev <ZUG_TOKEN>
```

- [ ] **Step 2: Restart Claude Code**

Quit and relaunch Claude Code. Open a new session and run:
```
/mcp
```
Expected: `zug` server listed as connected.

- [ ] **Step 3: Configure work laptop**

On the work laptop, pull the latest server:
```bash
cd ~/.zug/server && git pull
./install.sh --configure-http https://zug-mcp.fly.dev <ZUG_TOKEN>
```

Restart Claude Code on the work laptop and verify `/mcp` shows `zug` connected.

- [ ] **Step 4: Configure Claude desktop (this machine)**

Restart Claude desktop. Open a conversation and verify Zug tools are available.

- [ ] **Step 5: Configure Claude.ai web (manual)**

In Claude.ai: Settings → Integrations → Add MCP Server
- URL: `https://zug-mcp.fly.dev/mcp`
- Add header: `X-Zug-Token: <ZUG_TOKEN>`

Test by starting a conversation and calling `zug_get_context`.
