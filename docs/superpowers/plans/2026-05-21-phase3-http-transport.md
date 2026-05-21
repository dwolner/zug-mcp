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

- [ ] **Step 1: Snapshot current state before modifying**

```bash
cd ~/.zug/server
head -10 src/storage.ts
```

Expected: `const ZUG_DIR = path.join(os.homedir(), ".zug");` on line 5 or 6. Confirm this before editing.

- [ ] **Step 2: Update ZUG_DIR to read from env var**

Replace the top constants block:

```typescript
const ZUG_DIR = process.env.ZUG_DATA_DIR || path.join(os.homedir(), ".zug");
const SESSIONS_DIR = path.join(ZUG_DIR, "sessions");
const PERSONA_FILE = path.join(ZUG_DIR, "PERSONA.md");
const PLAYBOOK_FILE = path.join(ZUG_DIR, "PLAYBOOK.md");
const OBSERVATIONS_FILE = path.join(ZUG_DIR, "observations.jsonl");
const ACTIVE_FILE = path.join(ZUG_DIR, "ACTIVE.md");
```

- [ ] **Step 3: Verify default path still works (no env var)**

```bash
npx tsx src/stdio.ts &
sleep 1 && kill %1
echo "Exit: $?"
```

Expected: server starts without error, exits cleanly (exit 0).

- [ ] **Step 4: Verify ZUG_DATA_DIR override is respected**

```bash
TMPDIR=$(mktemp -d)
ZUG_DATA_DIR="$TMPDIR" npx tsx -e "
import { readPersona } from './src/storage.js';
const p = readPersona();
console.log('persona length:', p.length);
" && ls "$TMPDIR"
```

Expected: `persona length: 0` (empty — new dir), and `$TMPDIR` now contains a `sessions/` subdirectory created by `ensureDirs()`.

- [ ] **Step 5: Commit**

```bash
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

- [ ] **Step 2: Verify rate limiter behavior**

```bash
cd ~/.zug/server
npx tsx -e "
import { isRateLimited } from './src/rate-limit.js';
for (let i = 0; i < 60; i++) isRateLimited('test');
console.log('60th request allowed:', !isRateLimited('test'));
console.log('61st request blocked:', isRateLimited('test'));
console.log('different IP allowed:', !isRateLimited('other-ip'));
"
```

Expected:
```
60th request allowed: false
61st request blocked: true
different IP allowed: true
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

- [ ] **Step 2: Typecheck before running**

```bash
cd ~/.zug/server
pnpm typecheck
```

Expected: no errors. If errors appear, fix before continuing.

- [ ] **Step 3: Verify missing ZUG_TOKEN exits with error**

```bash
npx tsx src/http.ts
echo "Exit code: $?"
```

Expected: prints `ZUG_TOKEN env var is required` and exits non-zero.

- [ ] **Step 4: Start server and verify auth**

```bash
ZUG_TOKEN=test123 PORT=8787 npx tsx src/http.ts &
sleep 1

# No token — should 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/mcp -X POST
echo ""

# Wrong token — should 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/mcp -X POST -H "X-Zug-Token: wrong"
echo ""
```

Expected: two lines of `401`.

- [ ] **Step 5: Verify MCP initialize handshake**

```bash
curl -s http://localhost:8787/mcp \
  -X POST \
  -H "X-Zug-Token: test123" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' | python3 -m json.tool
```

Expected: JSON with `result.serverInfo.name` = `"zug"` and a `Mcp-Session-Id` response header.

- [ ] **Step 6: Verify rate limiting**

```bash
for i in $(seq 1 62); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/mcp -X POST -H "X-Zug-Token: test123"
done | sort | uniq -c
```

Expected: ~60 lines of `200` (or `400` for missing session) and ~2 lines of `429`.

- [ ] **Step 7: Stop server**

```bash
kill %1
```

- [ ] **Step 8: Commit**

```bash
git add src/http.ts
git commit -m "feat: add HTTP/SSE MCP server with auth and rate limiting"
```

---

## Task 4: Add Dockerfile and .dockerignore

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Verify Docker is available**

```bash
docker --version
```

Expected: `Docker version 2x.x.x` or similar. If not installed, install Docker Desktop before continuing.

- [ ] **Step 2: Create Dockerfile**

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

- [ ] **Step 3: Create .dockerignore**

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

- [ ] **Step 4: Build image and verify no build errors**

```bash
cd ~/.zug/server
docker build -t zug-mcp-test . 2>&1 | tail -5
```

Expected: last line is `Successfully built <id>` or `=> exporting to image`. No red errors.

- [ ] **Step 5: Run container and verify it responds**

```bash
docker run --rm -d --name zug-test -e ZUG_TOKEN=test -e PORT=8080 -p 8080:8080 zug-mcp-test
sleep 2

curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/mcp -X POST
echo ""
```

Expected: `401` — container is up, auth is enforced.

- [ ] **Step 6: Stop and clean up test container**

```bash
docker stop zug-test
docker rmi zug-mcp-test
```

- [ ] **Step 7: Commit**

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

`auto_stop_machines = "stop"` + `min_machines_running = 0` = free tier sleep/wake behavior. Cold starts acceptable per design.

- [ ] **Step 2: Verify flyctl is installed**

```bash
fly version
```

Expected: `fly v0.x.x ...`. If not installed: `brew install flyctl && fly auth login`.

- [ ] **Step 3: Commit**

```bash
git add fly.toml
git commit -m "feat: add fly.toml for fly.io deployment"
```

---

## Task 6: Create scripts/migrate.sh

**Files:**
- Create: `scripts/migrate.sh`

- [ ] **Step 1: Create scripts/ directory**

```bash
mkdir -p ~/.zug/server/scripts
```

- [ ] **Step 2: Create the script**

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

- [ ] **Step 3: Make executable and verify syntax**

```bash
chmod +x ~/.zug/server/scripts/migrate.sh
bash -n ~/.zug/server/scripts/migrate.sh
echo "Syntax OK: $?"
```

Expected: `Syntax OK: 0`

- [ ] **Step 4: Verify local source files exist before committing**

```bash
ls -la ~/.zug/{PERSONA.md,PLAYBOOK.md,ACTIVE.md,observations.jsonl} 2>&1
ls ~/.zug/sessions/ | wc -l
```

Expected: all 4 files listed, session count > 0. These are what will be migrated later.

- [ ] **Step 5: Commit**

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

- [ ] **Step 2: Run full typecheck across all source files**

```bash
cd ~/.zug/server
pnpm typecheck 2>&1
```

Expected: no errors. This validates storage.ts, http.ts, rate-limit.ts, and all existing files compile cleanly together.

- [ ] **Step 3: Verify build produces dist/http.js**

```bash
pnpm build && ls dist/
```

Expected: `dist/` contains `http.js`, `server.js`, `storage.js`, `stdio.js`, etc.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add start:http and migrate scripts"
```

---

## Task 8: Update install.sh — add --configure-http mode

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Snapshot current ~/.claude.json zug entry before modifying install.sh**

```bash
python3 -c "import json; c=json.load(open('$HOME/.claude.json')); print(json.dumps(c.get('mcpServers',{}).get('zug'), indent=2))"
```

Save this output — it's the stdio entry you're replacing. If something goes wrong, you can restore it manually.

- [ ] **Step 2: Add --configure-http block to install.sh**

Find the line `# ── Register with Claude Code (~/.claude.json) ────` and add the following new block immediately before it:

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

- [ ] **Step 3: Verify syntax**

```bash
bash -n ~/.zug/server/install.sh
echo "Syntax OK: $?"
```

Expected: `Syntax OK: 0`

- [ ] **Step 4: Dry-run against a temp copy of ~/.claude.json**

```bash
cp ~/.claude.json /tmp/claude-test.json

# Run against the temp copy by temporarily overriding HOME
HOME_BACKUP=$HOME
(HOME=/tmp python3 -c "
import json, sys
path = '/tmp/claude-test.json'
url = 'https://zug-mcp.fly.dev'
token = 'test-token'
config = json.load(open(path))
config.setdefault('mcpServers', {})['zug'] = {
  'type': 'http',
  'url': f'{url}/mcp',
  'headers': { 'X-Zug-Token': token }
}
json.dump(config, open(path, 'w'), indent=2)
")

# Inspect result
python3 -c "import json; c=json.load(open('/tmp/claude-test.json')); print(json.dumps(c['mcpServers']['zug'], indent=2))"
```

Expected:
```json
{
  "type": "http",
  "url": "https://zug-mcp.fly.dev/mcp",
  "headers": {
    "X-Zug-Token": "test-token"
  }
}
```

If the output looks correct, the install.sh logic is sound. Clean up:

```bash
rm /tmp/claude-test.json
```

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Verify git log looks clean before pushing**

```bash
cd ~/.zug/server
git log --oneline -10
git status
```

Expected: clean working tree, 8–10 new commits since the last push, no untracked files.

- [ ] **Step 2: Push**

```bash
git push origin main
```

---

## Task 11: Deploy to fly.io

> Requires `flyctl` installed: `brew install flyctl && fly auth login`

- [ ] **Step 1: Verify flyctl auth**

```bash
fly auth whoami
```

Expected: your fly.io email address. If not logged in: `fly auth login`.

- [ ] **Step 2: Create fly.io app**

```bash
cd ~/.zug/server
fly launch --no-deploy --name zug-mcp --region iad
```

When asked "would you like to copy its configuration to the new app?" — say **no** (we have our own `fly.toml`).

- [ ] **Step 3: Verify app was created**

```bash
fly status -a zug-mcp
```

Expected: app listed with `No machines` (not yet deployed). If it errors, the app name may be taken — try `zug-mcp-<yourname>` and update `fly.toml` to match.

- [ ] **Step 4: Create persistent volume**

```bash
fly volumes create zug_data --size 1 --region iad -a zug-mcp
```

Expected: output includes `state: created` and `Volume 'zug_data' created successfully`.

- [ ] **Step 5: Verify volume exists**

```bash
fly volumes list -a zug-mcp
```

Expected: one volume named `zug_data`, state `created`, size `1GB`, region `iad`.

- [ ] **Step 6: Set secrets**

Generate a strong token:
```bash
openssl rand -hex 32
```

Copy the output. Then set secrets (replace `<token>` and `<api-key>`):

```bash
fly secrets set \
  ZUG_TOKEN=<paste-generated-token> \
  ANTHROPIC_API_KEY=<new-anthropic-api-key> \
  ZUG_DATA_DIR=/data/.zug \
  -a zug-mcp
```

**Save the ZUG_TOKEN value now** — you'll need it in Task 12. Store it in your password manager.

- [ ] **Step 7: Verify secrets are set (names only — values are write-only)**

```bash
fly secrets list -a zug-mcp
```

Expected: three entries — `ZUG_TOKEN`, `ANTHROPIC_API_KEY`, `ZUG_DATA_DIR`.

- [ ] **Step 8: Deploy**

```bash
fly deploy -a zug-mcp
```

Watch the output. Expected: Docker build completes, machine starts, health checks pass. Final line: `✓ Machine ... is healthy`.

- [ ] **Step 9: Verify server is live and auth is enforced**

```bash
# No token — should return 401
curl -s https://zug-mcp.fly.dev/mcp -X POST
```

Expected: `{"error":"Unauthorized"}`. If you get a connection error or 5xx, check logs:

```bash
fly logs -a zug-mcp
```

- [ ] **Step 10: Verify volume is mounted**

```bash
fly ssh console -a zug-mcp -C "ls /data/.zug/ 2>/dev/null && echo 'mount OK' || echo 'mount MISSING'"
```

Expected: `mount OK` (directory exists, may be empty). If `mount MISSING`, the volume isn't attached — check `fly.toml` mounts section and redeploy.

- [ ] **Step 11: Migrate data**

> Only proceed if Step 10 confirmed the mount is working.

```bash
cd ~/.zug/server
pnpm migrate
```

Expected: files queued and uploaded, ends with `[migrate] Done.`

- [ ] **Step 12: Verify data arrived on the volume**

```bash
fly ssh console -a zug-mcp -C "ls -la /data/.zug/ && echo '---' && ls /data/.zug/sessions/ | wc -l"
```

Expected: PERSONA.md, PLAYBOOK.md, ACTIVE.md, observations.jsonl all present. Session count matches your local `~/.zug/sessions/` count.

---

## Task 12: Configure clients

> Only proceed once Task 11 Step 9 confirms `{"error":"Unauthorized"}` from the live server.

- [ ] **Step 1: Snapshot current ~/.claude.json zug entry (backup)**

```bash
python3 -c "import json; c=json.load(open('$HOME/.claude.json')); print(json.dumps(c.get('mcpServers',{}).get('zug'), indent=2))" | tee /tmp/zug-stdio-backup.json
```

Keep `/tmp/zug-stdio-backup.json` — it's your rollback if Claude Code can't connect.

- [ ] **Step 2: Run the HTTP configure script**

```bash
~/.zug/server/install.sh --configure-http https://zug-mcp.fly.dev <ZUG_TOKEN>
```

- [ ] **Step 3: Verify ~/.claude.json was updated correctly**

```bash
python3 -c "import json; c=json.load(open('$HOME/.claude.json')); print(json.dumps(c.get('mcpServers',{}).get('zug'), indent=2))"
```

Expected:
```json
{
  "type": "http",
  "url": "https://zug-mcp.fly.dev/mcp",
  "headers": {
    "X-Zug-Token": "<your-token>"
  }
}
```

If the output is wrong, restore from backup before restarting Claude Code:
```bash
# Rollback if needed:
python3 -c "
import json
with open('$HOME/.claude.json') as f: c = json.load(f)
with open('/tmp/zug-stdio-backup.json') as f: old = json.load(f)
c['mcpServers']['zug'] = old
with open('$HOME/.claude.json', 'w') as f: json.dump(c, f, indent=2)
print('Rolled back')
"
```

- [ ] **Step 4: Restart Claude Code and verify MCP connection**

Quit and relaunch Claude Code. In a new session run:
```
/mcp
```

Expected: `zug` listed as connected. If it shows as disconnected or errors, check `fly logs -a zug-mcp` for server-side errors.

- [ ] **Step 5: Verify Zug actually reads from fly.io (not local files)**

```bash
# Rename local PERSONA.md temporarily
mv ~/.zug/PERSONA.md ~/.zug/PERSONA.md.local-backup
```

In Claude Code, call `zug_get_context` (or start a new session which triggers it automatically). The PERSONA content should still appear — it's coming from the fly.io volume, not local files.

```bash
# Restore local backup
mv ~/.zug/PERSONA.md.local-backup ~/.zug/PERSONA.md
```

- [ ] **Step 6: Configure work laptop**

On the work laptop, pull the latest server and configure:
```bash
cd ~/.zug/server && git pull
./install.sh --configure-http https://zug-mcp.fly.dev <ZUG_TOKEN>
```

Verify `~/.claude.json` on that machine shows the HTTP entry (same Step 3 check), then restart Claude Code.

- [ ] **Step 7: Configure Claude desktop**

Restart Claude desktop. Open a conversation and verify the Zug tools (`zug_get_context`, `zug_save_observation`, etc.) appear in the tools list.

- [ ] **Step 8: Configure Claude.ai web (manual)**

In Claude.ai: Settings → Integrations → Add MCP Server
- URL: `https://zug-mcp.fly.dev/mcp`
- Add header: `X-Zug-Token: <ZUG_TOKEN>`

Test: start a conversation and run `zug_get_context`. Expected: your PERSONA content loads from fly.io.
