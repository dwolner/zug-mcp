import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
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
  try {
    // Auth
    const rawToken = req.headers["x-zug-token"];
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    const tokenBuf = Buffer.from(typeof token === "string" ? token : "");
    const expectedBuf = Buffer.from(ZUG_TOKEN);
    if (tokenBuf.length !== expectedBuf.length || !timingSafeEqual(tokenBuf, expectedBuf)) {
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

    const raw = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(raw) ? raw[0] : raw;

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
  } catch (err) {
    console.error("Request handler error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`Zug MCP HTTP server listening on port ${PORT}`);
});
