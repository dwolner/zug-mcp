import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readPersona,
  readPlaybook,
  readActive,
  writePersona,
  writePlaybook,
  writeActive,
  appendObservation,
  getObservationsBySession,
  writeSession,
  getRecentSessions,
  getStats,
  getLastSessionDate,
  getPersonaExcerpt,
  getObservationTrend,
  syncRulesContext,
  getLastSessionSummary,
  getLastSessionTimestamp,
  getObservationsSince,
  reinforcePattern,
  getTopPatterns,
  type ObservationType,
} from "./storage.js";
import { synthesize } from "./synthesize.js";

export function createServer(): McpServer {
  const server = new McpServer({ name: "zug", version: "1.0.0" });

  server.tool(
    "zug_get_context",
    "Load Zug context — call this at the start of every session to get the current cognitive fingerprint and playbook.",
    {
      delta: z.boolean().optional().describe("Return only what changed since the last session instead of the full fingerprint (default: false)"),
    },
    async ({ delta }) => {
      syncRulesContext();

      if (delta) {
        const active = readActive();
        const stats = getStats();
        const lastDate = getLastSessionDate();
        const lastSummary = getLastSessionSummary();
        const lastTimestamp = getLastSessionTimestamp();
        const recentObs = lastTimestamp ? getObservationsSince(lastTimestamp) : [];

        const parts = [
          `# Zug Context (delta)\nSessions: ${stats.sessions} | Last: ${lastDate ?? "none"} | Observations: ${stats.observations}\n`,
          active ? `## Active Patterns\n${active}` : "",
          lastSummary ? `## Last session\n${lastSummary}` : "",
          recentObs.length > 0
            ? `## New since last session (${recentObs.length})\n${recentObs.map((o) => `- [${o.type}/${o.confidence}] ${o.observation}`).join("\n")}`
            : "*No new observations since last session.*",
          "*(Full fingerprint: call zug_get_context without delta)*",
        ].filter(Boolean);

        return { content: [{ type: "text" as const, text: parts.join("\n\n") }] };
      }

      const persona = readPersona();
      const playbook = readPlaybook();
      const active = readActive();
      const stats = getStats();

      const parts = [
        `# Zug Context\nSessions: ${stats.sessions} | Observations: ${stats.observations}\n`,
        active ? `## Active Patterns\n${active}` : "",
        persona
          ? `## Cognitive Fingerprint\n${persona}`
          : "## Cognitive Fingerprint\n*Not yet built. This is an early session.*",
        playbook ? `## Playbook\n${playbook}` : "",
      ].filter(Boolean);

      return { content: [{ type: "text" as const, text: parts.join("\n\n") }] };
    }
  );

  server.tool(
    "zug_save_observation",
    "Save an observation about this person's thinking, patterns, or context. Call this mid-session when you notice something worth remembering.",
    {
      observation: z.string().describe("What you observed"),
      type: z.enum(["cognitive_pattern", "preference", "mistake", "breakthrough", "context"]).describe("Type of observation"),
      session_id: z.string().describe("Current session identifier"),
      confidence: z.enum(["low", "medium", "high"]).describe("How confident you are"),
      context: z.string().optional().describe('Session context tag, e.g. "work" or "personal"'),
    },
    async ({ observation, type, session_id, confidence, context }) => {
      appendObservation({
        timestamp: new Date().toISOString(),
        type: type as ObservationType,
        observation,
        session_id,
        confidence,
        context,
      });
      const contextLabel = context ? ` [${context}]` : "";
      return { content: [{ type: "text" as const, text: `Saved: [${type}/${confidence}]${contextLabel} ${observation}` }] };
    }
  );

  server.tool(
    "zug_end_session",
    "Call when a session ends. Writes the session log and appends observations to PERSONA.md.",
    {
      session_id: z.string().describe("Session identifier used during this session"),
      summary: z.string().describe("What was explored, decided, or worked on — and any notable moments"),
      context: z.string().optional().describe('Session context tag, e.g. "work" or "personal"'),
      decisions: z.array(z.string()).optional().describe("Key decisions made this session"),
      blockers: z.array(z.string()).optional().describe("What is blocking understanding or progress"),
      next_steps: z.array(z.string()).optional().describe("What to pick up at the start of the next session"),
    },
    async ({ session_id, summary, context, decisions, blockers, next_steps }) => {
      const observations = getObservationsBySession(session_id);
      const persona = readPersona();
      const playbook = readPlaybook();
      const today = new Date().toISOString().slice(0, 10);

      const obsText =
        observations.length > 0
          ? observations.map((o) => `- [${o.type}/${o.confidence}] ${o.observation}`).join("\n")
          : "*No observations saved this session.*";

      const sessionLines = [
        `# Session ${session_id}`,
        `Date: ${new Date().toISOString()}`,
        ...(context ? [`Context: ${context}`] : []),
        "",
        "## Summary",
        summary,
        ...(decisions?.length ? ["", "## Decisions", ...decisions.map((d) => `- ${d}`)] : []),
        ...(blockers?.length ? ["", "## Blockers", ...blockers.map((b) => `- ${b}`)] : []),
        ...(next_steps?.length ? ["", "## Next Steps", ...next_steps.map((s) => `- ${s}`)] : []),
        "",
        "## Observations",
        obsText,
      ];

      writeSession(session_id, sessionLines.join("\n"));

      // Append observations immediately (synchronous, always succeeds)
      const meaningful = observations.filter((o) => o.confidence !== "low");
      if (meaningful.length > 0) {
        const newEntries = meaningful.map((o) => `- [${o.type}] ${o.observation} *(${today})*`).join("\n");
        writePersona(
          persona
            ? `${persona}\n\n### ${today}\n${newEntries}`
            : `# Cognitive Fingerprint\n\n### ${today}\n${newEntries}`
        );
      }

      // Kick off Haiku synthesis in background — rewrites PERSONA/PLAYBOOK/ACTIVE if successful
      if (meaningful.length > 0) {
        synthesize({
          currentPersona: persona,
          currentPlaybook: readPersona(), // re-read after append
          sessionSummary: summary,
          observations: meaningful.map((o) => ({
            type: o.type,
            observation: o.observation,
            confidence: o.confidence,
          })),
          reinforcedPatterns: getTopPatterns(10),
        }).then((result) => {
          if (result) {
            writePersona(result.persona);
            writePlaybook(result.playbook);
            if (result.active) writeActive(result.active);
          }
        }).catch(() => {
          // Synthesis failed — appended observations remain in PERSONA
        });
      }

      const stats = getStats();
      const contextLabel = context ? ` context=${context}` : "";
      const structuredParts = [
        decisions?.length ? `${decisions.length} decision${decisions.length > 1 ? "s" : ""}` : null,
        blockers?.length ? `${blockers.length} blocker${blockers.length > 1 ? "s" : ""}` : null,
        next_steps?.length ? `${next_steps.length} next step${next_steps.length > 1 ? "s" : ""}` : null,
      ].filter(Boolean);
      const structuredLabel = structuredParts.length ? ` (${structuredParts.join(", ")})` : "";

      return {
        content: [{
          type: "text" as const,
          text: `Session saved${contextLabel}${structuredLabel}. ${observations.length} observations. Total: ${stats.sessions} sessions, ${stats.observations} observations. Synthesis running in background.`,
        }],
      };
    }
  );

  server.tool(
    "zug_get_recent_sessions",
    "Returns recent session summaries. Useful for re-establishing context after a gap.",
    {
      limit: z.number().int().min(1).max(20).describe("Number of recent sessions to return (1–20)"),
      context: z.string().optional().describe('Filter by context tag, e.g. "work" or "personal"'),
    },
    async ({ limit, context }) => {
      const sessions = getRecentSessions(limit, context);
      return {
        content: [{
          type: "text" as const,
          text: sessions.length === 0 ? "No sessions recorded yet." : sessions.join("\n\n---\n\n"),
        }],
      };
    }
  );

  server.tool(
    "zug_status",
    "Returns Zug stats — session count, observation count, persona size, last session date, excerpt, and weekly trend.",
    async () => {
      const { sessions, observations, personaLines } = getStats();
      const lastDate = getLastSessionDate();
      const excerpt = getPersonaExcerpt(2);
      const trend = getObservationTrend(4);

      const lines = [
        `- Sessions: ${sessions}${lastDate ? ` | Last: ${lastDate}` : ""}`,
        `- Observations: ${observations}`,
        `- Persona lines: ${personaLines}`,
        excerpt ? `- Excerpt: ${excerpt}` : null,
        `- Trend (obs/week, last 4): ${trend.join(" → ")}`,
      ].filter(Boolean).join("\n");

      return {
        content: [{ type: "text" as const, text: `Zug status:\n${lines}` }],
      };
    }
  );

  server.tool(
    "zug_reinforce_observation",
    "Mark a pattern as recurring across sessions. Call this when you notice the same observation appearing again. Reinforced patterns get elevated weight in synthesis.",
    {
      text: z.string().describe("The observation text to reinforce — ideally matching a previous observation"),
    },
    async ({ text }) => {
      const trimmed = text.trim();
      if (!trimmed) return { content: [{ type: "text" as const, text: "Error: text cannot be empty" }] };
      const result = reinforcePattern(trimmed);
      return {
        content: [{ type: "text" as const, text: `Reinforced (${result.count}x): ${result.text}` }],
      };
    }
  );

  return server;
}
