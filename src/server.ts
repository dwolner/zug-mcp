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
  createLesson,
  getLessonById,
  updateLesson,
  reinforceLesson,
  getActiveLessons,
  type ObservationType,
  type Lesson,
} from "./storage.js";
import { synthesize } from "./synthesize.js";

export function digestLessons(): string {
  const lessons = getActiveLessons();
  if (lessons.length === 0) return "";
  const lines = lessons.map((l, i) => {
    const count = l.reinforcementCount > 0 ? ` (reinforced ${l.reinforcementCount}x)` : "";
    return `${i + 1}. [${l.id}] ${l.title} — ${l.content}${count}`;
  });
  return `## Lessons (${lessons.length} active)\n${lines.join("\n")}`;
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "zug", version: "1.0.0" });

  server.tool(
    "zug_get_context",
    "Load Zug context — call this at the start of every session to get the current cognitive fingerprint and playbook. Use delta=false (default) for cold starts; use delta=true after compaction/resume to load only what changed since the last session.",
    {
      delta: z.boolean().optional().describe("Return only what changed since the last session instead of the full fingerprint. Use for post-compaction resumes; default false for cold session starts."),
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
        let lessonDigest = "";
        try { lessonDigest = digestLessons(); } catch { /* best-effort */ }

        const parts = [
          `# Zug Context (delta)\nSessions: ${stats.sessions} | Last: ${lastDate ?? "none"} | Observations: ${stats.observations}\n`,
          active ? `## Active Patterns\n${active}` : "",
          lessonDigest,
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
      let lessonDigest = "";
      try { lessonDigest = digestLessons(); } catch { /* best-effort */ }

      const parts = [
        `# Zug Context\nSessions: ${stats.sessions} | Observations: ${stats.observations}\n`,
        active ? `## Active Patterns\n${active}` : "",
        lessonDigest,
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
        }).catch((err: unknown) => {
          console.error("[zug] synthesis failed:", err instanceof Error ? err.message : err);
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
    "Returns Zug stats — session count, observation count, persona size, last session date, excerpt, weekly trend, and active patterns.",
    async () => {
      const { sessions, observations, personaLines } = getStats();
      const lastDate = getLastSessionDate();
      const excerpt = getPersonaExcerpt(2);
      const trend = getObservationTrend(4);
      const active = readActive();

      const lines = [
        `- Sessions: ${sessions}${lastDate ? ` | Last: ${lastDate}` : ""}`,
        `- Observations: ${observations}`,
        `- Persona lines: ${personaLines}`,
        excerpt ? `- Excerpt: ${excerpt}` : null,
        `- Trend (obs/week, last 4): ${trend.join(" → ")}`,
      ].filter(Boolean).join("\n");

      const parts = [
        `Zug status:\n${lines}`,
        active ? `\n\n## Active Patterns\n${active}` : "",
      ].filter(Boolean);

      return {
        content: [{ type: "text" as const, text: parts.join("") }],
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

  server.tool(
    "zug_create_lesson",
    "Promote an observation or pattern to a named, status-tracked lesson. Lessons surface in zug_get_context and zug_lesson_digest.",
    {
      title: z.string().max(500).describe("Concise lesson name"),
      content: z.string().max(10000).describe("Actionable rule (1-3 sentences)"),
      context: z.string().max(5000).describe("Evidence, ticket/issue references"),
      source: z.enum(["review", "correction", "postmortem", "manual"]).describe("How this lesson was identified"),
      tags: z.array(z.string().max(50)).max(10).optional().describe("Optional tags"),
      supersedes: z.string().regex(/^L-\d{3,}$/).optional().describe("ID of lesson this supersedes"),
    },
    async ({ title, content, context, source, tags, supersedes }) => {
      try {
        const lesson = createLesson({ title, content, context, source, tags: tags ?? [], supersedes });
        return { content: [{ type: "text" as const, text: `Saved: [${lesson.id}] ${lesson.title}` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "zug_lesson_digest",
    "Returns active lessons ranked by reinforcement count. Use at session start as a behavioral frame supplement.",
    {},
    async () => {
      try {
        const digest = digestLessons();
        return { content: [{ type: "text" as const, text: digest || "No active lessons." }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "zug_lesson_update",
    "Update status or content of an existing lesson.",
    {
      id: z.string().regex(/^L-\d{3,}$/).describe("Lesson ID to update"),
      title: z.string().max(500).optional(),
      content: z.string().max(10000).optional(),
      context: z.string().max(5000).optional(),
      tags: z.array(z.string().max(50)).max(10).optional(),
      status: z.enum(["active", "validated", "deprecated"]).optional(),
      supersedes: z.string().regex(/^L-\d{3,}$/).optional(),
    },
    async ({ id, title, content, context, tags, status, supersedes }) => {
      try {
        const updates: Partial<Pick<Lesson, "title" | "content" | "context" | "tags" | "status" | "supersedes">> = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (context !== undefined) updates.context = context;
        if (tags !== undefined) updates.tags = tags;
        if (status !== undefined) updates.status = status;
        if (supersedes !== undefined) updates.supersedes = supersedes;
        const lesson = updateLesson(id, updates);
        if (!lesson) return { content: [{ type: "text" as const, text: `Error: lesson ${id} not found` }] };
        return { content: [{ type: "text" as const, text: `Updated: [${lesson.id}] ${lesson.title} (status: ${lesson.status})` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "zug_reinforce_lesson",
    "Increment reinforcement count for a lesson — call when the lesson's pattern recurs across sessions.",
    {
      id: z.string().regex(/^L-\d{3,}$/).describe("Lesson ID to reinforce"),
    },
    async ({ id }) => {
      try {
        const lesson = reinforceLesson(id);
        if (!lesson) return { content: [{ type: "text" as const, text: `Error: lesson ${id} not found` }] };
        return { content: [{ type: "text" as const, text: `Reinforced [${lesson.id}] (${lesson.reinforcementCount}x): ${lesson.title}` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  return server;
}
