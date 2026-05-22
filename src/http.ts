import { randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createServer } from "./server.js";
import { isRateLimited } from "./rate-limit.js";
import { zugOAuthProvider } from "./oauth-provider.js";

const ZUG_TOKEN = process.env.ZUG_TOKEN || "";
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

const app = express();

// OAuth endpoints: /.well-known/oauth-authorization-server, /authorize, /token, /register, /revoke
app.use(mcpAuthRouter({ provider: zugOAuthProvider, issuerUrl }));

// Rate limit middleware for /mcp
app.use("/mcp", (req, res, next) => {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too Many Requests" });
    return;
  }
  next();
});

// Auth middleware: Bearer token (OAuth) OR X-Zug-Token header (legacy)
app.use("/mcp", (req, res, next) => {
  if (req.headers.authorization?.startsWith("Bearer ")) {
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
});

// MCP session handling
app.use("/mcp", express.raw({ type: "*/*" }));

app.all("/mcp", async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`[zug] Zug MCP HTTP server listening on port ${PORT}`);
});
