import { randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createServer } from "./server.js";
import { isRateLimited } from "./rate-limit.js";
import { zugOAuthProvider } from "./oauth-provider.js";
import { handleSyncPull, handleSyncPush } from "./sync-server.js";
import { runWithTenant, toUserId, DEFAULT_USER_ID, migrateLegacyData } from "./tenancy.js";

const ZUG_TOKEN = process.env.ZUG_TOKEN || "";
if (!ZUG_TOKEN) {
  console.warn("[zug] Warning: ZUG_TOKEN is not set — server accepts connections without a shared secret");
}
const PORT = parseInt(process.env.PORT || "8080", 10);
const ZUG_URL = process.env.ZUG_URL || `http://localhost:${PORT}`;

// Validate issuer URL has no path component
const issuerUrl = new URL(ZUG_URL);
if (issuerUrl.pathname !== "/" && issuerUrl.pathname !== "") {
  throw new Error(`ZUG_URL must be a bare origin with no path. Got: ${ZUG_URL}`);
}

console.log(`[zug] OAuth tokens are in-memory only. Clients must re-authorize after server restart.`);
console.log(`[zug] Issuer: ${ZUG_URL}`);

const transports = new Map<string, StreamableHTTPServerTransport>();

function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Resolve the tenant userId for an authenticated request (provisional until T-045's SQLite
 * account mapping). OAuth Bearer → the verified client_id (normalized to a safe segment). Legacy
 * X-Zug-Token → the single shared default user (all legacy callers collapse to one tenant by design).
 * Called only after zugAuth has accepted the request, so requireBearerAuth has populated req.auth.
 */
function resolveUserId(req: express.Request): string {
  const auth = (req as express.Request & { auth?: { clientId?: string } }).auth;
  if (auth?.clientId) return toUserId(auth.clientId);
  return DEFAULT_USER_ID;
}

const app = express();

// OAuth endpoints: /.well-known/oauth-authorization-server, /authorize, /token, /register, /revoke
app.use(mcpAuthRouter({ provider: zugOAuthProvider, issuerUrl }));

// Rate limit middleware (shared by /mcp and /sync)
function rateLimitMw(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too Many Requests" });
    return;
  }
  next();
}

// Auth middleware: Bearer token (OAuth) OR X-Zug-Token header (legacy) (shared by /mcp and /sync)
function zugAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.headers.authorization) {
    // Any Authorization header must be Bearer — reject others immediately
    if (!req.headers.authorization.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    requireBearerAuth({ provider: zugOAuthProvider })(req, res, next);
    return;
  }

  // Legacy X-Zug-Token auth (Claude Code, curl, etc.)
  if (ZUG_TOKEN) {
    const rawToken = req.headers["x-zug-token"];
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    const tokenBuf = Buffer.from(typeof token === "string" ? token : "");
    const expectedBuf = Buffer.from(ZUG_TOKEN);
    if (tokenBuf.length === expectedBuf.length && timingSafeEqual(tokenBuf, expectedBuf)) {
      next();
      return;
    }
  }

  res.status(401).json({ error: "Unauthorized" });
}

app.use("/mcp", rateLimitMw);
app.use("/mcp", zugAuth);

// MCP session handling
app.use("/mcp", express.raw({ type: "*/*" }));

app.all("/mcp", (req, res) => {
  // Run the ENTIRE handler (both the session-init and session-reuse branches, plus the error path)
  // inside the tenant scope so every storage call the MCP tools make resolves to this user (PR-3).
  // ALS propagates through transport.handleRequest's awaited handler dispatch. Transports are keyed
  // by `${userId}:${sessionId}` so a session created for one user can't be driven by another (PR-4);
  // data isolation itself is enforced at the path layer per-request, not the session layer.
  try {
    const userId = resolveUserId(req);
    void runWithTenant(userId, async () => {
    try {
      const body = req.body && req.body.length > 0
        ? JSON.parse(req.body.toString())
        : undefined;

      const raw = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(raw) ? raw[0] : raw;

      if (req.method === "POST" && !sessionId) {
        let sessionTransport!: StreamableHTTPServerTransport;
        sessionTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            const key = `${userId}:${id}`;
            transports.set(key, sessionTransport);
            sessionTransport.onclose = () => transports.delete(key);
          },
        });
        const mcpServer = createServer();
        await mcpServer.connect(sessionTransport);
        await sessionTransport.handleRequest(req, res, body);
      } else if (sessionId) {
        const transport = transports.get(`${userId}:${sessionId}`);
        if (!transport) {
          res.status(404).json({ error: "Session not found" });
          return;
        }
        await transport.handleRequest(req, res, body);
      } else {
        res.status(400).json({ error: "Missing Mcp-Session-Id header" });
      }
    } catch (err) {
      console.error("Request handler error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
    });
  } catch (err) {
    console.error("Request scope error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
});

// Sync endpoints
app.use("/sync", rateLimitMw);
app.use("/sync", zugAuth);
app.use("/sync", express.json({ limit: "16mb" }));

app.get("/sync/pull", (req, res) => {
  const since = typeof req.query.since === "string" ? req.query.since : "1970-01-01T00:00:00.000Z";
  // Outer guard catches scope-entry throws (resolveUserId/assertSafeUserId) and any fs error from the
  // read-only pull, mirroring the /sync/push and /mcp handlers so every boundary fails uniformly.
  try {
    const userId = resolveUserId(req);
    runWithTenant(userId, () => { res.json(handleSyncPull(since)); });
  } catch (err) {
    console.error("sync pull error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/sync/push", (req, res) => {
  try {
    const userId = resolveUserId(req);
    void runWithTenant(userId, async () => {
      try {
        res.json(await handleSyncPush(req.body));
      } catch (err) {
        console.error("sync push error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" });
      }
    });
  } catch (err) {
    console.error("sync push scope error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" });
  }
});

async function main(): Promise<void> {
  // One-time multi-tenant migration: relocate any pre-existing flat content into the default user's
  // namespace BEFORE serving requests, so no request is ever handled against half-moved content (PR-2).
  try {
    const m = migrateLegacyData();
    if (m.migrated) {
      console.log(`[zug] migrated ${m.movedCount} legacy content entr${m.movedCount === 1 ? "y" : "ies"} into the '${DEFAULT_USER_ID}' namespace`);
    }
  } catch (err) {
    console.error("[zug] legacy migration failed:", err instanceof Error ? err.message : err);
    throw err; // fail fast — do not serve with a half-migrated volume
  }

  app.listen(PORT, () => {
    console.log(`[zug] Zug MCP HTTP server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("[zug] fatal startup error:", err);
  process.exit(1);
});
