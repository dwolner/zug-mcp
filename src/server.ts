import Anthropic from "@anthropic-ai/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadApiKey, HAIKU_MODEL } from "./api-key.js";
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
  appendGrowthSnapshot,
  readGrowthSnapshots,
  readOpenThread,
  writeOpenThread,
  getLessonCandidates,
  getStaleGrowthWarning,
  archiveObservations,
  archiveSessions,
  type ObservationType,
  type Lesson,
  type SocraticThread,
} from "./storage.js";
import { synthesize } from "./synthesize.js";
import { getSyncMode } from "./sync-state.js";
import { pull, push } from "./sync.js";
import { getCurrentUserId } from "./tenancy.js";
import { enqueueSynthesis } from "./synthesis-queue.js";

export function getOpenThread(): SocraticThread | null { return readOpenThread(); }
export function resetOpenThread(): void { writeOpenThread(null); }
/** @internal test helper only */
export function setOpenThreadForTesting(question: string, sessionId: string): void {
  writeOpenThread({ question, openedAt: new Date().toISOString(), sessionId });
}

export function digestLessons(): string {
  const lessons = getActiveLessons();
  if (lessons.length === 0) return "";
  const lines = lessons.map((l, i) => {
    const count = l.reinforcementCount > 0 ? ` (reinforced ${l.reinforcementCount}x)` : "";
    return `${i + 1}. [${l.id}] ${l.title} — ${l.content}${count}`;
  });
  return `## Lessons (${lessons.length} active)\n${lines.join("\n")}`;
}

export function growthSummary(): string {
  const allSnapshots = readGrowthSnapshots();
  if (allSnapshots.length === 0) return "No growth data yet. Run a session first.";

  const total = allSnapshots.length;
  const snapshots = allSnapshots
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5);
  const latest = snapshots[0];

  const obsTrend = snapshots.map((s) => s.observationCount).reverse().join(" → ");
  const personaTrend = snapshots.map((s) => s.personaLines).reverse().join(" → ");

  const patternLines = latest.topPatterns.length > 0
    ? latest.topPatterns.map((p, i) => `${i + 1}. "${p.text}" (${p.count}x)`).join("\n")
    : "*(none yet)*";

  return [
    `## Growth Summary (${total} sessions)`,
    "",
    `Sessions: ${latest.sessionCount} | Observations: ${latest.observationCount} | Active lessons: ${latest.lessonCount}`,
    "",
    `### Observation trend (last ${snapshots.length} sessions)`,
    obsTrend,
    "",
    "### Top reinforced patterns",
    patternLines,
    "",
    `### Persona growth (lines, last ${snapshots.length} sessions)`,
    personaTrend,
  ].join("\n");
}

type McpTextResult = { content: [{ type: "text"; text: string }] };

export async function runGetContext(args: { delta?: boolean }): Promise<McpTextResult> {
  // In synced mode, pull latest merged data from the canonical server before reading local context.
  if (getSyncMode() === "synced") {
    await pull({ timeoutMs: 3000 }); // never throws; sets paused on failure
  }

  syncRulesContext();

  const { delta } = args;

  if (delta) {
    const active = readActive();
    const stats = getStats();
    const lastDate = getLastSessionDate();
    const lastSummary = getLastSessionSummary();
    const lastTimestamp = getLastSessionTimestamp();
    const recentObs = lastTimestamp ? getObservationsSince(lastTimestamp) : [];
    let lessonDigest = "";
    try { lessonDigest = digestLessons(); } catch { /* best-effort */ }
    const thread = readOpenThread();
    const threadBlock = thread ? `## Open Thread\n${thread.question}` : "";
    const staleWarningDelta = getStaleGrowthWarning();
    const staleBlockDelta = staleWarningDelta ? `## Growth Alert\n${staleWarningDelta}` : "";

    const parts = [
      `# Zug Context (delta)\nSessions: ${stats.sessions} | Last: ${lastDate ?? "none"} | Observations: ${stats.observations}\n`,
      active ? `## Active Patterns\n${active}` : "",
      lessonDigest,
      threadBlock,
      staleBlockDelta,
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
  const currentThread = readOpenThread();
  const fullThreadBlock = currentThread ? `## Open Thread\n${currentThread.question}` : "";
  const staleWarningFull = getStaleGrowthWarning();
  const staleBlockFull = staleWarningFull ? `## Growth Alert\n${staleWarningFull}` : "";

  const parts = [
    `# Zug Context\nSessions: ${stats.sessions} | Observations: ${stats.observations}\n`,
    active ? `## Active Patterns\n${active}` : "",
    lessonDigest,
    fullThreadBlock,
    staleBlockFull,
    persona
      ? `## Cognitive Fingerprint\n${persona}`
      : "## Cognitive Fingerprint\n*Not yet built. This is an early session.*",
    playbook ? `## Playbook\n${playbook}` : "",
  ].filter(Boolean);

  return { content: [{ type: "text" as const, text: parts.join("\n\n") }] };
}

export async function runEndSession(args: {
  session_id: string;
  summary: string;
  context?: string;
  decisions?: string[];
  blockers?: string[];
  next_steps?: string[];
}): Promise<McpTextResult> {
  const { session_id, summary, context, decisions, blockers, next_steps } = args;
  const mode = getSyncMode();

  const observations = getObservationsBySession(session_id);
  const persona = readPersona();
  const today = new Date().toISOString().slice(0, 10);

  const obsText =
    observations.length > 0
      ? observations.map((o) => `- [${o.type}/${o.confidence}] ${o.observation}`).join("\n")
      : "*No observations saved this session.*";

  const savedThread = readOpenThread();
  const unresolvedThread = savedThread?.sessionId === session_id ? savedThread : null;

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
    ...(unresolvedThread ? ["", "## Unresolved Thread", unresolvedThread.question] : []),
    "",
    "## Observations",
    obsText,
  ];

  writeSession(session_id, sessionLines.join("\n"));
  // Synchronous reset before async synthesis; also clears orphaned threads from other sessions
  writeOpenThread(null);
  archiveSessions();

  if (mode !== "synced") {
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

    // Kick off Haiku synthesis via the per-user queue — serialized per user, non-blocking,
    // rewrites PERSONA/PLAYBOOK/ACTIVE if successful. Capture userId + inputs in the current tenant
    // scope; the queue re-enters that scope when the task runs (undefined userId → flat/local).
    if (meaningful.length > 0) {
      const userId = getCurrentUserId();
      const synthInput = {
        currentPersona: persona,
        currentPlaybook: readPlaybook(),
        sessionSummary: summary,
        observations: meaningful.map((o) => ({ type: o.type, observation: o.observation, confidence: o.confidence })),
        reinforcedPatterns: getTopPatterns(10),
      };
      void enqueueSynthesis(userId, async () => {
        const result = await synthesize(synthInput);
        if (result) {
          writePersona(result.persona);
          writePlaybook(result.playbook);
          if (result.active) writeActive(result.active);
          archiveObservations();
        }
      });
    }
  }

  const stats = getStats();

  try {
    appendGrowthSnapshot({
      timestamp: new Date().toISOString(),
      sessionId: session_id,
      sessionCount: stats.sessions,
      observationCount: stats.observations,
      personaLines: stats.personaLines,
      topPatterns: getTopPatterns(5).map((p) => ({ text: p.text, count: p.count })),
      activePatternCount: readActive().split("\n").filter((l) => l.trim().length > 0).length,
      lessonCount: getActiveLessons().length,
    });
  } catch { /* best-effort */ }

  if (mode === "synced") {
    void push().catch(() => { /* paused state already recorded by push */ });
  }

  const contextLabel = context ? ` context=${context}` : "";
  const structuredParts = [
    decisions?.length ? `${decisions.length} decision${decisions.length > 1 ? "s" : ""}` : null,
    blockers?.length ? `${blockers.length} blocker${blockers.length > 1 ? "s" : ""}` : null,
    next_steps?.length ? `${next_steps.length} next step${next_steps.length > 1 ? "s" : ""}` : null,
    unresolvedThread ? "1 unresolved thread" : null,
  ].filter(Boolean);
  const structuredLabel = structuredParts.length ? ` (${structuredParts.join(", ")})` : "";

  const candidates = getLessonCandidates(3);
  const candidatesBlock = candidates.length > 0
    ? `\n\nLesson candidates (reinforced 3+ times, not yet promoted):\n${candidates.map((p) => `  • "${p.text}" (${p.count}x)`).join("\n")}\nCall zug_create_lesson to promote any of these to named behavioral rules.`
    : "";

  const syncNote = mode === "synced"
    ? "Sync push queued; synthesis runs on the server."
    : "Synthesis running in background.";

  return {
    content: [{
      type: "text" as const,
      text: `Session saved${contextLabel}${structuredLabel}. ${observations.length} observations. Total: ${stats.sessions} sessions, ${stats.observations} observations. ${syncNote}${candidatesBlock}`,
    }],
  };
}

export const ZUG_INSTRUCTIONS = `Zug is a havruta-style learning companion with persistent memory across sessions.

Start every session by calling zug_get_context to load the current cognitive fingerprint and active patterns.
This is non-negotiable — session context is how Zug provides continuity and behavioral guidance.

End every significant session by calling zug_end_session with a summary.

Use zug_save_observation to record notable patterns during the session.
Use zug_get_recent_sessions to understand what work has happened recently.`;

export async function handleReasoningAnalysis(text: string): Promise<McpTextResult> {
  try {
    const apiKey = loadApiKey();
    if (!apiKey) {
      return { content: [{ type: "text" as const, text: "Error: No API key configured — set ANTHROPIC_API_KEY or add it to ~/.zug/.env" }] };
    }
    const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 2 });

    const lenses: Array<{ name: string; prompt: string }> = [
      { name: "Conceptual Clarity", prompt: `Analyze this text for conceptual clarity. Are key terms defined and used consistently? Flag any ambiguous or shifting concepts. Be specific and concise (2-3 sentences):\n\n${text}` },
      { name: "Assumption Identification", prompt: `What assumptions are being made in this text without being stated explicitly? List the most significant ones. Be specific and concise (2-3 sentences):\n\n${text}` },
      { name: "Logical Consistency", prompt: `Assess the logical consistency of this reasoning. Are the inferences valid? Do conclusions follow from the premises? Be specific and concise (2-3 sentences):\n\n${text}` },
      { name: "Knowledge Gaps", prompt: `What is unknown or uncertain in this reasoning that could materially affect the conclusion? Identify the most important gaps. Be specific and concise (2-3 sentences):\n\n${text}` },
      { name: "Analogical Reasoning", prompt: `What analogies or comparisons are being used, implicitly or explicitly? Do they hold? Where do they break down? Be specific and concise (2-3 sentences):\n\n${text}` },
      { name: "Meta-Cognitive Awareness", prompt: `Is the reasoner aware of their own reasoning process? Do they acknowledge uncertainty, bias, or limitations in their thinking? Be specific and concise (2-3 sentences):\n\n${text}` },
    ];

    const settled = await Promise.allSettled(
      lenses.map(async (lens) => {
        const response = await client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 200,
          messages: [{ role: "user", content: lens.prompt }],
        });
        const block = response.content[0];
        const analysis = block.type === "text" ? block.text.trim() : "(no response)";
        return `### ${lens.name}\n${analysis}`;
      })
    );

    const sections = settled.map((result, i) =>
      result.status === "fulfilled" ? result.value : `### ${lenses[i].name}\n(lens failed)`
    );

    return {
      content: [{ type: "text" as const, text: `## Reasoning Analysis\n\n${sections.join("\n\n")}` }],
    };
  } catch (err) {
    return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "zug", version: "1.0.0" }, { instructions: ZUG_INSTRUCTIONS });

  server.tool(
    "zug_get_context",
    "Load Zug context — call this at the start of every session to get the current cognitive fingerprint and playbook. Use delta=false (default) for cold starts; use delta=true after compaction/resume to load only what changed since the last session.",
    {
      delta: z.boolean().optional().describe("Return only what changed since the last session instead of the full fingerprint. Use for post-compaction resumes; default false for cold session starts."),
    },
    async (args) => runGetContext(args)
  );

  server.tool(
    "zug_save_observation",
    "Save an observation about this person's thinking, patterns, or context. Call this mid-session when you notice something worth remembering.",
    {
      observation: z.string().describe("What you observed"),
      type: z.enum(["cognitive_pattern", "preference", "mistake", "breakthrough", "context"]).describe("Type of observation"),
      sessionId: z.string().describe("Current session identifier"),
      confidence: z.enum(["low", "medium", "high"]).describe("How confident you are"),
      context: z.string().optional().describe('Session context tag, e.g. "work" or "personal"'),
    },
    async ({ observation, type, sessionId, confidence, context }) => {
      appendObservation({
        timestamp: new Date().toISOString(),
        type: type as ObservationType,
        observation,
        session_id: sessionId,
        confidence,
        context,
      });
      const contextLabel = context ? ` [${context}]` : "";
      return { content: [{ type: "text" as const, text: `Saved: [${type}/${confidence}]${contextLabel} ${observation}` }] };
    }
  );

  server.tool(
    "zug_end_session",
    "Call when a session ends. Writes the session log, appends observations, and surfaces reinforced patterns ready for promotion to lessons.",
    {
      sessionId: z.string().describe("Session identifier used during this session"),
      summary: z.string().describe("What was explored, decided, or worked on — and any notable moments"),
      context: z.string().optional().describe('Session context tag, e.g. "work" or "personal"'),
      decisions: z.array(z.string()).optional().describe("Key decisions made this session"),
      blockers: z.array(z.string()).optional().describe("What is blocking understanding or progress"),
      next_steps: z.array(z.string()).optional().describe("What to pick up at the start of the next session"),
    },
    async ({ sessionId, ...rest }) => runEndSession({ session_id: sessionId, ...rest })
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
    "Returns Zug stats — session count, observation count, persona size, last session date, excerpt, weekly trend, active patterns, and a stale-growth warning if no new observations have been recorded recently.",
    async () => {
      const { sessions, observations, personaLines } = getStats();
      const lastDate = getLastSessionDate();
      const excerpt = getPersonaExcerpt(2);
      const trend = getObservationTrend(4);
      const active = readActive();
      const obsRate = sessions > 0 ? (observations / sessions).toFixed(1) : "0";
      const staleWarning = getStaleGrowthWarning();

      const lines = [
        `- Sessions: ${sessions}${lastDate ? ` | Last: ${lastDate}` : ""}`,
        `- Observations: ${observations} (avg ${obsRate}/session)`,
        `- Persona lines: ${personaLines}`,
        excerpt ? `- Excerpt: ${excerpt}` : null,
        `- Trend (obs/week, last 4): ${trend.join(" → ")}`,
        staleWarning ? `- Warning: ${staleWarning}` : null,
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
    "Mark a pattern as recurring across sessions. Call this when you notice the same observation appearing again. Uses fuzzy matching — near-equivalent phrasings reinforce the same entry. Reinforced patterns get elevated weight in synthesis.",
    {
      text: z.string().describe("The observation text to reinforce — fuzzy matching handles minor rephrasing"),
    },
    async ({ text }) => {
      const trimmed = text.trim();
      if (!trimmed) return { content: [{ type: "text" as const, text: "Error: text cannot be empty" }] };
      const { pattern, matched, similarity } = reinforcePattern(trimmed);
      const matchNote = matched && pattern.text !== trimmed
        ? ` (fuzzy match, similarity ${Math.round(similarity * 100)}%)`
        : "";
      const existing = getTopPatterns(5);
      const existingNote = existing.length > 0
        ? `\n\nTop patterns for reference:\n${existing.map((p) => `- (${p.count}x) ${p.text}`).join("\n")}`
        : "";
      return {
        content: [{ type: "text" as const, text: `Reinforced (${pattern.count}x)${matchNote}: ${pattern.text}${existingNote}` }],
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
      supersedes: z.string().regex(/^L-[a-z0-9-]+$/).optional().describe("ID of lesson this supersedes"),
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
      id: z.string().regex(/^L-[a-z0-9-]+$/).describe("Lesson ID to update"),
      title: z.string().max(500).optional(),
      content: z.string().max(10000).optional(),
      context: z.string().max(5000).optional(),
      tags: z.array(z.string().max(50)).max(10).optional(),
      status: z.enum(["active", "validated", "deprecated"]).optional(),
      supersedes: z.string().regex(/^L-[a-z0-9-]+$/).optional(),
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
    "zug_open_thread",
    "Open a Socratic thread — call when Zug asks a question worth tracking. Only one thread is active at a time; opening a new one replaces any existing open thread.",
    {
      question: z.string().max(1000).describe("The Socratic question Zug asked"),
      sessionId: z.string().describe("Current session identifier"),
    },
    async ({ question, sessionId }) => {
      try {
        writeOpenThread({ question, openedAt: new Date().toISOString(), sessionId });
        return { content: [{ type: "text" as const, text: `Thread opened: ${question}` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "zug_close_thread",
    "Close the active Socratic thread — call when the user has answered the question substantively.",
    {},
    async () => {
      try {
        if (!readOpenThread()) return { content: [{ type: "text" as const, text: "No open thread" }] };
        writeOpenThread(null);
        return { content: [{ type: "text" as const, text: "Thread resolved" }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "zug_get_open_thread",
    "Check whether there is an unresolved Socratic thread. Call at session wind-down or before opening a new thread.",
    {},
    async () => {
      try {
        const t = readOpenThread();
        if (!t) return { content: [{ type: "text" as const, text: "No open thread" }] };
        return { content: [{ type: "text" as const, text: `Open thread (since ${t.openedAt}): ${t.question}` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "zug_reinforce_lesson",
    "Increment reinforcement count for a lesson — call when the lesson's pattern recurs across sessions.",
    {
      id: z.string().regex(/^L-[a-z0-9-]+$/).describe("Lesson ID to reinforce"),
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

  server.tool(
    "zug_growth_summary",
    "Returns a trend digest showing how Zug's knowledge and persona have grown over time.",
    async () => {
      try {
        return { content: [{ type: "text" as const, text: growthSummary() }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

  server.tool(
    "zug_reasoning_analysis",
    "Run parallel multi-lens analysis of a piece of reasoning or decision. Returns structured feedback across 6 cognitive lenses: conceptual clarity, assumption identification, logical consistency, knowledge gaps, analogical reasoning, and meta-cognitive awareness.",
    {
      text: z.string().min(10).max(2000).describe("The reasoning, argument, or decision text to analyze"),
    },
    async ({ text }) => handleReasoningAnalysis(text)
  );

  return server;
}
