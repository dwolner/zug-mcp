# Context Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `context` field (e.g. `"work"`, `"personal"`) to observations and sessions so agents and scripts can later filter Zug data by context without partitioning the cognitive fingerprint.

**Architecture:** Add `context?: string` to the `Observation` type and session file headers in `storage.ts`. Thread it through `server.ts` as an optional param on `zug_save_observation`, `zug_end_session`, and `zug_get_recent_sessions`. No changes to PERSONA.md or synthesis — the fingerprint stays unified.

**Tech Stack:** TypeScript, Zod, `@modelcontextprotocol/sdk`. No test framework — verify with `pnpm typecheck` and manual tool call inspection.

---

### Task 1: Add `context` to the `Observation` type and storage layer

**Files:**
- Modify: `src/storage.ts`

- [ ] **Step 1: Add `context` to the `Observation` interface**

In `src/storage.ts`, update the interface:

```typescript
export interface Observation {
  timestamp: string;
  type: ObservationType;
  observation: string;
  session_id: string;
  confidence: "low" | "medium" | "high";
  context?: string;
}
```

- [ ] **Step 2: Update `writeSession` to include context in the session file header**

Replace the existing `writeSession` function:

```typescript
export function writeSession(session_id: string, content: string): void {
  ensureDirs();
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(SESSIONS_DIR, `${date}-${session_id}.md`);
  fs.writeFileSync(file, content, "utf-8");
}
```

The content is assembled in `server.ts` — context will be injected there (Task 2). No change needed here.

- [ ] **Step 3: Add `getRecentSessionsByContext` filter to `getRecentSessions`**

Replace the existing `getRecentSessions` function:

```typescript
export function getRecentSessions(limit: number, context?: string): string[] {
  ensureDirs();
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  const results: string[] = [];
  for (const f of files) {
    if (results.length >= limit) break;
    const content = fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8");
    if (context) {
      // Match "Context: work" header line (case-insensitive)
      const hasContext = /^Context:\s*\S/im.test(content) &&
        new RegExp(`^Context:\\s*${context}\\s*$`, "im").test(content);
      if (!hasContext) continue;
    }
    results.push(`## ${f}\n${content}`);
  }
  return results;
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/danno/.zug/server
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/storage.ts
git commit -m "feat: add context field to Observation type and session filtering"
```

---

### Task 2: Thread `context` through MCP tools in `server.ts`

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add `context` param to `zug_save_observation`**

In the `zug_save_observation` tool definition, add the optional param and pass it to `appendObservation`:

```typescript
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
```

- [ ] **Step 2: Add `context` param to `zug_end_session`**

Update the tool definition and session log to include context in the header:

```typescript
server.tool(
  "zug_end_session",
  "Call when a session ends. Writes the session log and appends observations to PERSONA.md.",
  {
    session_id: z.string().describe("Session identifier used during this session"),
    summary: z.string().describe("What was explored, decided, or worked on — and any notable moments"),
    context: z.string().optional().describe('Session context tag, e.g. "work" or "personal"'),
  },
  async ({ session_id, summary, context }) => {
    const observations = getObservationsBySession(session_id);
    const persona = readPersona();
    const playbook = readPlaybook();
    const today = new Date().toISOString().slice(0, 10);

    const obsText =
      observations.length > 0
        ? observations.map((o) => `- [${o.type}/${o.confidence}] ${o.observation}`).join("\n")
        : "*No observations saved this session.*";

    const contextLine = context ? `Context: ${context}\n` : "";

    writeSession(
      session_id,
      [
        `# Session ${session_id}`,
        `Date: ${new Date().toISOString()}`,
        contextLine.trimEnd(),
        "",
        "## Summary",
        summary,
        "",
        "## Observations",
        obsText,
      ]
        .filter((line) => line !== "")
        .join("\n")
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
          if (result.active) writeActive(result.active);
          synthesized = true;
        }
      } catch {
        // Synthesis failed — fall through to append
      }

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
    const contextLabel = context ? ` context=${context}` : "";
    return {
      content: [{
        type: "text" as const,
        text: `Session saved (${method}${contextLabel}). ${observations.length} observations. Total: ${stats.sessions} sessions, ${stats.observations} observations.`,
      }],
    };
  }
);
```

- [ ] **Step 3: Add optional `context` filter to `zug_get_recent_sessions`**

```typescript
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
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/danno/.zug/server
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts
git commit -m "feat: add optional context param to save_observation, end_session, get_recent_sessions"
```

---

### Task 3: Update zug.md rule to instruct Claude to pass context

**Files:**
- Modify: `/Users/danno/.claude/rules/zug.md`
- Modify: `/Users/danno/.zug/server/prompts/system-prompt-desktop.md`

- [ ] **Step 1: Add context guidance to the Observation Gate in `zug.md`**

Find the Observation Gate section and add context instruction:

```markdown
### Observation Gate

Something notable happens:
→ Does an existing PERSONA pattern explain this, or is this new or contradicting?
→ If new or contradicting AND confidence is medium/high: call `zug_save_observation`
  → Include `context` if the session has a clear domain: "work", "personal", or a project name
→ Otherwise: continue without saving
```

And update the Session End Gate:

```markdown
### Session End Gate

Wind-down detected (shorter responses, topic closing, "thanks", silence):
→ Is there a summary worth writing?
→ Write one-paragraph summary
→ Call `zug_end_session` with session_id, summary, and context (if known)
→ Done
```

- [ ] **Step 2: Apply the same updates to `system-prompt-desktop.md`**

Make the identical changes to the Session Gates section in `/Users/danno/.zug/server/prompts/system-prompt-desktop.md`.

- [ ] **Step 3: Commit**

```bash
git add /Users/danno/.claude/rules/zug.md /Users/danno/.zug/server/prompts/system-prompt-desktop.md
git commit -m "docs: instruct Claude to pass context tag on observations and session end"
```

---

### Task 4: Update ROADMAP and push

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Mark context tagging as complete in Phase 4**

In `ROADMAP.md`, under Phase 4, add context tagging as a completed item:

```markdown
## Phase 4 — Polish 📋

**In progress:**
- ✅ Context tagging — optional `context` field on observations and sessions; `zug_get_recent_sessions` filterable by context

**What to build:**
- OAuth support for the HTTP server — unblocks Claude.ai web integration
...
```

- [ ] **Step 2: Commit and push everything**

```bash
git add ROADMAP.md
git commit -m "docs: note context tagging complete in roadmap"
git push
```
