# Zug Gate-Based Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Zug's rule-based PERSONA/PLAYBOOK usage with gate sequences that force explicit activation at session start and govern the session arc.

**Architecture:** Four changes form a chain — synthesis generates an Active Patterns block (`ACTIVE.md`), `zug_get_context` prepends it to the context response, a gate-based prompt forces explicit activation before responding, and gate sequences govern the full session arc. No new dependencies required.

**Tech Stack:** TypeScript, Node.js, `@anthropic-ai/sdk` (already in use), `pnpm typecheck` for verification.

**Note on tests:** No test infrastructure exists in this codebase (Phase 4 roadmap item). Verification is via `pnpm typecheck` after each change.

**Spec:** `docs/superpowers/specs/2026-04-24-zug-gate-based-context-design.md`

---

## File Map

| File | Change |
|---|---|
| `src/storage.ts` | Add `ACTIVE_FILE` constant, `readActive()`, `writeActive()` |
| `src/synthesize.ts` | Update `SynthesisResult` interface; replace rules with gates in prompt; add `<ACTIVE>` output; update parser |
| `src/server.ts` | `zug_get_context` prepends active patterns; `zug_end_session` writes active after synthesis |
| `src/merge.ts` | Write `ACTIVE.md` after successful merge synthesis |
| `prompts/zug-rule.md` | Rewrite with gate sequences |
| `~/.claude/rules/zug.md` | Same content as `prompts/zug-rule.md` |

---

## Task 1: Add `readActive` / `writeActive` to `src/storage.ts`

**Files:**
- Modify: `src/storage.ts`

- [ ] **Step 1: Add the `ACTIVE_FILE` constant and two functions**

In `src/storage.ts`, after line 8 (`const OBSERVATIONS_FILE = ...`), add:

```typescript
const ACTIVE_FILE = path.join(ZUG_DIR, "ACTIVE.md");
```

After `writePlaybook` (after line 51), add:

```typescript
export function readActive(): string {
  ensureDirs();
  if (!fs.existsSync(ACTIVE_FILE)) return "";
  return fs.readFileSync(ACTIVE_FILE, "utf-8");
}

export function writeActive(content: string): void {
  ensureDirs();
  fs.writeFileSync(ACTIVE_FILE, content, "utf-8");
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/danno/.zug/server && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/danno/.zug/server
git add src/storage.ts
git commit -m "feat: add readActive/writeActive for ACTIVE.md"
```

---

## Task 2: Update `src/synthesize.ts` — gate-based prompt + `<ACTIVE>` output

**Files:**
- Modify: `src/synthesize.ts`

- [ ] **Step 1: Add `active` to the `SynthesisResult` interface**

Replace:
```typescript
export interface SynthesisResult {
  persona: string;
  playbook: string;
}
```

With:
```typescript
export interface SynthesisResult {
  persona: string;
  playbook: string;
  active: string;
}
```

- [ ] **Step 2: Replace the `## Rules` block and `## Your Task` section in the prompt**

Replace the entire `const prompt = \`...\`` block (lines 54–86) with:

```typescript
  const prompt = `You are maintaining a cognitive fingerprint for a person you work with as a learning companion (havruta). You have two files to update based on a new session.

## Before adding anything new to PERSONA:
→ Quote the exact text from this session's observations that supports it
→ Is that a direct observation, or an inference?
→ Only if direct: add it

## Before removing or significantly rewording an existing PERSONA line:
→ Quote the exact observation from this session that contradicts it
→ Only if you have an explicit contradiction: remove or reword it
→ If uncertain: leave it and add a dated note below it

## Before adding to PLAYBOOK:
→ Is this a universal pattern across sessions, or specific to this session?
→ Only if universal: add it

## Before updating PLAYBOOK:
→ Does this session's evidence strengthen, weaken, or nuance the existing entry?
→ Only if it changes the meaning: update it

## Always:
- Integrate new observations into existing sections rather than appending dated entries
- Keep the tone direct and observational, not flattering
- PERSONA.md is about THIS PERSON — how they think, what they do, where they get stuck
- PLAYBOOK.md is about WHAT WORKS — universal patterns for effective learning sessions${trimInstruction}

## Current PERSONA.md
${input.currentPersona || "*Empty — this is the first synthesis.*"}

## Current PLAYBOOK.md
${input.currentPlaybook || "*Empty — no playbook yet.*"}

## Session Summary
${input.sessionSummary}

## Observations from This Session
${obsBlock}

## Your Task
Return three outputs in exactly this format:

<PERSONA>
(full updated PERSONA.md content)
</PERSONA>

<PLAYBOOK>
(full updated PLAYBOOK.md content)
</PLAYBOOK>

Then write 3-5 active patterns for the NEXT session. Before each pattern:
→ Is this directly supported by an observation from PERSONA or this session?
→ Is this specific enough to change behavior, or is it generic advice?
→ Only if both: include it

Format each as a direct behavioral instruction: "when X → do Y" or "don't Z until W"

<ACTIVE>
(active patterns, one per line)
</ACTIVE>`;
```

- [ ] **Step 3: Update the parser to extract `<ACTIVE>` and update the return value**

Replace:
```typescript
  const personaMatch = text.match(/<PERSONA>\n?([\s\S]*?)\n?<\/PERSONA>/);
  const playbookMatch = text.match(/<PLAYBOOK>\n?([\s\S]*?)\n?<\/PLAYBOOK>/);

  if (!personaMatch || !playbookMatch) return null;

  return {
    persona: personaMatch[1].trim(),
    playbook: playbookMatch[1].trim(),
  };
```

With:
```typescript
  const personaMatch = text.match(/<PERSONA>\n?([\s\S]*?)\n?<\/PERSONA>/);
  const playbookMatch = text.match(/<PLAYBOOK>\n?([\s\S]*?)\n?<\/PLAYBOOK>/);
  const activeMatch = text.match(/<ACTIVE>\n?([\s\S]*?)\n?<\/ACTIVE>/);

  if (!personaMatch || !playbookMatch || !activeMatch) return null;

  return {
    persona: personaMatch[1].trim(),
    playbook: playbookMatch[1].trim(),
    active: activeMatch[1].trim(),
  };
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/danno/.zug/server && pnpm typecheck
```

Expected: no errors. (TypeScript will flag any callers that don't handle the new `active` field — fix those in subsequent tasks.)

- [ ] **Step 5: Commit**

```bash
cd /Users/danno/.zug/server
git add src/synthesize.ts
git commit -m "feat: gate-based synthesis prompt with ACTIVE patterns output"
```

---

## Task 3: Update `src/server.ts` — wire `readActive` and `writeActive`

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Import `readActive` and `writeActive`**

In the import at the top of `src/server.ts`, add `readActive` and `writeActive` to the existing destructured import:

```typescript
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
```

- [ ] **Step 2: Update `zug_get_context` to prepend the active patterns block**

Replace the body of the `zug_get_context` tool handler (lines 23–37) with:

```typescript
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
```

- [ ] **Step 3: Update `zug_end_session` to write active patterns after synthesis**

In the `zug_end_session` handler, find the synthesis success block (around lines 102–105):

```typescript
          if (result) {
            writePersona(result.persona);
            writePlaybook(result.playbook);
            synthesized = true;
          }
```

Replace with:

```typescript
          if (result) {
            writePersona(result.persona);
            writePlaybook(result.playbook);
            writeActive(result.active);
            synthesized = true;
          }
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/danno/.zug/server && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/danno/.zug/server
git add src/server.ts
git commit -m "feat: wire active patterns into zug_get_context and zug_end_session"
```

---

## Task 4: Update `src/merge.ts` — write `ACTIVE.md` after merge synthesis

**Files:**
- Modify: `src/merge.ts`

- [ ] **Step 1: Import `writeActive` from storage**

At the top of `src/merge.ts`, the existing import is:

```typescript
import { synthesize } from "./synthesize.js";
```

Replace with:

```typescript
import { synthesize } from "./synthesize.js";
import { writeActive } from "./storage.js";
```

- [ ] **Step 2: Write `ACTIVE.md` after successful synthesis**

Find the synthesis success block (around lines 127–139):

```typescript
  if (result) {
    // Back up originals
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    if (localPersona) {
      fs.writeFileSync(path.join(ZUG_DIR, `PERSONA.md.backup-${ts}`), localPersona);
    }
    if (localPlaybook) {
      fs.writeFileSync(path.join(ZUG_DIR, `PLAYBOOK.md.backup-${ts}`), localPlaybook);
    }

    fs.writeFileSync(path.join(ZUG_DIR, "PERSONA.md"), result.persona, "utf-8");
    fs.writeFileSync(path.join(ZUG_DIR, "PLAYBOOK.md"), result.playbook, "utf-8");
    console.log("PERSONA.md: synthesized (backup saved)");
    console.log("PLAYBOOK.md: synthesized (backup saved)");
  }
```

Replace with:

```typescript
  if (result) {
    // Back up originals
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    if (localPersona) {
      fs.writeFileSync(path.join(ZUG_DIR, `PERSONA.md.backup-${ts}`), localPersona);
    }
    if (localPlaybook) {
      fs.writeFileSync(path.join(ZUG_DIR, `PLAYBOOK.md.backup-${ts}`), localPlaybook);
    }

    fs.writeFileSync(path.join(ZUG_DIR, "PERSONA.md"), result.persona, "utf-8");
    fs.writeFileSync(path.join(ZUG_DIR, "PLAYBOOK.md"), result.playbook, "utf-8");
    writeActive(result.active);
    console.log("PERSONA.md: synthesized (backup saved)");
    console.log("PLAYBOOK.md: synthesized (backup saved)");
    console.log("ACTIVE.md: updated");
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/danno/.zug/server && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/danno/.zug/server
git add src/merge.ts
git commit -m "feat: write ACTIVE.md after merge synthesis"
```

---

## Task 5: Rewrite `prompts/zug-rule.md` and `~/.claude/rules/zug.md`

**Files:**
- Modify: `prompts/zug-rule.md`
- Modify: `~/.claude/rules/zug.md`

Both files get identical content. Write it to `prompts/zug-rule.md` first, then copy to `~/.claude/rules/zug.md`.

- [ ] **Step 1: Write the gate-based rule to `prompts/zug-rule.md`**

Replace the entire file content with:

```markdown
# Zug — Always Present

You are always Zug, a learning and thinking companion (havruta in the Jewish tradition). Zug means "pair" in Hebrew. The pair is the point.

## Always On

Zug runs in every session — coding, learning, deciding, anything. Your presence adapts to context, but your observation never stops.

## Session Gates

### Session Start Gate

HARD GATE: When a new session begins:
→ Call `zug_get_context`
→ Active Patterns block is in the response
→ Identify which 2-3 patterns are most relevant to the user's first message
→ Set behavioral frame: challenge intensity, communication style, what to watch for
→ Only then: respond to the user

### Mode Gate

Each message arrives:
→ Does this signal a mode change from current mode?
→ If yes: which Active Patterns apply to the new mode?
→ Adjust behavioral frame
→ Then: respond

**Task mode** (coding, debugging, executing): Do the work. Don't interrupt with Socratic questions. Observe; surface insights at natural pauses only.

**Learning mode** (exploring ideas, questions, concepts): Full havruta. Ask before explaining. Challenge don't validate. Hold the thread. Re-engage before they give up.

**Decision mode** (a fork, a tradeoff, a choice): Stress-test. "What would you need to believe for this to be wrong?" Find the holes before they commit.

### Observation Gate

Something notable happens:
→ Does an existing PERSONA pattern explain this, or is this new or contradicting?
→ If new or contradicting AND confidence is medium/high: call `zug_save_observation`
→ Otherwise: continue without saving

Use session_id format: `YYYY-MM-DD-{topic}` (e.g. `2026-04-24-learning-companion`)

### Session End Gate

Wind-down detected (shorter responses, topic closing, "thanks", silence):
→ Is there a summary worth writing?
→ Write one-paragraph summary
→ Call `zug_end_session` with session_id and summary
→ Done

## Honest Socratic

You know things. When you ask "what do you think?" you're not pretending. You're choosing to hear their thinking first. Say so when relevant: "I have a take — but what's yours first?" Never fake ignorance.

## The ZUG

You + this human = something neither produces alone. That's the mission. Long-term success: they start asking the questions you would have asked. Then you level up the challenge.

---
*Full system prompt: ~/.claude/zug-system-prompt.md*
```

- [ ] **Step 2: Copy to `~/.claude/rules/zug.md`**

```bash
cp /Users/danno/.zug/server/prompts/zug-rule.md /Users/danno/.claude/rules/zug.md
```

- [ ] **Step 3: Verify both files are identical**

```bash
diff /Users/danno/.zug/server/prompts/zug-rule.md /Users/danno/.claude/rules/zug.md
```

Expected: no output (files are identical).

- [ ] **Step 4: Commit**

```bash
cd /Users/danno/.zug/server
git add prompts/zug-rule.md
git commit -m "feat: replace rule-based zug prompt with gate sequences"
```

Note: `~/.claude/rules/zug.md` is outside the repo — no need to commit it separately.

---

## Self-Review

**Spec coverage:**
- `src/storage.ts` readActive/writeActive → Task 1 ✓
- `src/synthesize.ts` gate-based prompt + ACTIVE output → Task 2 ✓
- `src/server.ts` zug_get_context prepends active → Task 3 ✓
- `src/server.ts` zug_end_session writes active → Task 3 ✓
- `src/merge.ts` writes ACTIVE after merge → Task 4 ✓
- `prompts/zug-rule.md` + `~/.claude/rules/zug.md` gate sequences → Task 5 ✓
- Cold-start (no ACTIVE.md) gracefully omitted in context → handled by `active ? ... : ""` filter in Task 3 ✓

**Type consistency:**
- `SynthesisResult.active: string` defined in Task 2, consumed in Task 3 (`writeActive(result.active)`) and Task 4 (`writeActive(result.active)`) ✓
- `readActive` / `writeActive` defined in Task 1, imported in Tasks 3 and 4 ✓
