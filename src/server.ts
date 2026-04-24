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
  type ObservationType,
} from "./storage.js";
import { synthesize } from "./synthesize.js";

export function createServer(): McpServer {
  const server = new McpServer({ name: "zug", version: "1.0.0" });

  server.tool(
    "zug_get_context",
    "Load Zug context — call this at the start of every session to get the current cognitive fingerprint and playbook.",
    async () => {
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
    },
    async ({ observation, type, session_id, confidence }) => {
      appendObservation({
        timestamp: new Date().toISOString(),
        type: type as ObservationType,
        observation,
        session_id,
        confidence,
      });
      return { content: [{ type: "text" as const, text: `Saved: [${type}/${confidence}] ${observation}` }] };
    }
  );

  server.tool(
    "zug_end_session",
    "Call when a session ends. Writes the session log and appends observations to PERSONA.md.",
    {
      session_id: z.string().describe("Session identifier used during this session"),
      summary: z.string().describe("What was explored, decided, or worked on — and any notable moments"),
    },
    async ({ session_id, summary }) => {
      const observations = getObservationsBySession(session_id);
      const persona = readPersona();
      const playbook = readPlaybook();
      const today = new Date().toISOString().slice(0, 10);

      const obsText =
        observations.length > 0
          ? observations.map((o) => `- [${o.type}/${o.confidence}] ${o.observation}`).join("\n")
          : "*No observations saved this session.*";

      // Always write the session log
      writeSession(
        session_id,
        [`# Session ${session_id}`, `Date: ${new Date().toISOString()}`, "", "## Summary", summary, "", "## Observations", obsText].join("\n")
      );

      // Try Haiku synthesis, fall back to append
      let synthesized = false;
      const meaningful = observations.filter((o) => o.confidence !== "low");

      if (meaningful.length > 0) {
        try {
          const result = await synthesize({
            currentPersona: persona,
            currentPlaybook: playbook,
            sessionSummary: summary,
            observations: meaningful.map((o) => ({
              type: o.type,
              observation: o.observation,
              confidence: o.confidence,
            })),
          });

          if (result) {
            writePersona(result.persona);
            writePlaybook(result.playbook);
            writeActive(result.active);
            synthesized = true;
          }
        } catch {
          // Synthesis failed — fall through to append
        }

        // Fallback: append like Phase 1
        if (!synthesized) {
          const newEntries = meaningful.map((o) => `- [${o.type}] ${o.observation} *(${today})*`).join("\n");
          writePersona(
            persona
              ? `${persona}\n\n### ${today}\n${newEntries}`
              : `# Cognitive Fingerprint\n\n### ${today}\n${newEntries}`
          );
        }
      }

      const stats = getStats();
      const method = synthesized ? "synthesized" : "appended";
      return {
        content: [{
          type: "text" as const,
          text: `Session saved (${method}). ${observations.length} observations. Total: ${stats.sessions} sessions, ${stats.observations} observations.`,
        }],
      };
    }
  );

  server.tool(
    "zug_get_recent_sessions",
    "Returns recent session summaries. Useful for re-establishing context after a gap.",
    {
      limit: z.number().int().min(1).max(20).describe("Number of recent sessions to return (1–20)"),
    },
    async ({ limit }) => {
      const sessions = getRecentSessions(limit);
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
    "Returns Zug stats — session count, observation count, persona size.",
    async () => {
      const { sessions, observations, personaLines } = getStats();
      return {
        content: [{
          type: "text" as const,
          text: `Zug status:\n- Sessions: ${sessions}\n- Observations: ${observations}\n- Persona lines: ${personaLines}`,
        }],
      };
    }
  );

  return server;
}
