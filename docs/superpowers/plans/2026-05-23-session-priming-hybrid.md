# Session Priming Hybrid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a genuine fast-path tier for session priming by adding active patterns to `zug_status`, completing a three-tier system: status (lightest) → delta (medium) → full context (heaviest).

**Architecture:** `zug_status` already returns stats (sessions, observations, persona excerpt, trend). Adding the ACTIVE.md content turns it into a meaningful orientation call (~400 tokens) without loading PERSONA or PLAYBOOK. The three tiers then map cleanly to session scenarios, and `zug-rule.md` is updated to document the choice.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, existing `readActive()` storage function (already exported).

---

## File Map

| File | Change |
|------|--------|
| `src/server.ts` | Add `readActive()` call to `zug_status` handler; include active patterns in response |
| `prompts/zug-rule.md` | Replace single Session Start Gate call with three-tier guidance |
| `docs/session-priming-comparison.md` | Add completed three-tier summary section |

No new files. No schema changes. No new storage functions needed — `readActive()` is already exported from `storage.ts`.

---

## Task 1: Add active patterns to `zug_status`

**Files:**
- Modify: `src/server.ts` (the `zug_status` tool handler, around line 215)

The `zug_status` handler currently does not call `readActive()`. Add it so the response includes active patterns when present.

- [ ] **Step 1: Write the failing test**

Add to `src/storage.test.ts` (find the `zug_status`-adjacent section, or add at the end of the describe block):

```typescript
it("readActive returns empty string when ACTIVE.md missing", () => {
  // readActive is already tested but verify it's safe to call in zug_status context
  const result = readActive();
  expect(typeof result).toBe("string");
});
```

This test already passes (readActive is tested), but run it to confirm baseline.

- [ ] **Step 2: Run tests to confirm baseline**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Update `zug_status` handler in `src/server.ts`**

Find the `zug_status` tool (around line 213). Replace the handler body:

```typescript
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
        active ? `\n## Active Patterns\n${active}` : "",
      ].filter(Boolean);

      return {
        content: [{ type: "text" as const, text: parts.join("") }],
      };
    }
  );
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "feat: add active patterns to zug_status for lightweight session orientation (T-014)"
```

---

## Task 2: Document the three-tier system in `zug-rule.md`

**Files:**
- Modify: `prompts/zug-rule.md` (the Session Start Gate section)

The current gate says "call `zug_get_context` (full)" for cold starts and "call with `delta: true`" after compaction. Add `zug_status` as an explicit third tier for quick-task sessions.

- [ ] **Step 1: Update the Session Start Gate in `prompts/zug-rule.md`**

Replace the Session Start Gate section with:

```markdown
### Session Start Gate

HARD GATE: When a new session begins, choose the tier that matches the session:

**Tier 1 — Quick orientation** (`zug_status`): ~400 tokens
→ Use when: short task, user jumps straight to a specific question, no need for deep calibration
→ Returns: stats + active patterns. Enough to set a behavioral frame.

**Tier 2 — Delta** (`zug_get_context` with `delta: true`): ~500 tokens
→ Use when: resuming after compaction, reconnecting mid-flow
→ Returns: active patterns + last session summary + new observations since last session end

**Tier 3 — Full context** (`zug_get_context`): ~4,500 tokens (grows with PERSONA)
→ Use when: cold start with complex or open-ended session, meta-work on Zug itself
→ Returns: active patterns + full cognitive fingerprint + playbook

**Default for uncertainty:** Tier 3. The cost of missing context outweighs the token savings.

→ What does the Active Patterns block contain?
  (If absent: early session — proceed without a behavioral frame)
→ Identify which 2-3 patterns are most relevant to the user's first message
→ Set behavioral frame: challenge intensity, communication style, what to watch for
→ Only then: respond to the user
```

- [ ] **Step 2: Run typecheck (no TS changes, but confirm no regressions)**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add prompts/zug-rule.md
git commit -m "docs: document three-tier session priming system in zug-rule.md (T-014)"
```

---

## Task 3: Update session-priming-comparison.md

**Files:**
- Modify: `docs/session-priming-comparison.md`

Add a final section summarising the completed three-tier system now that T-014 is done.

- [ ] **Step 1: Append three-tier summary to `docs/session-priming-comparison.md`**

Add at the end of the file:

```markdown
## Completed three-tier system (post T-014)

After T-002 (delta mode), T-005 (comparison doc), and T-014 (zug_status active patterns):

| Tier | Call | Tokens | When |
|------|------|--------|------|
| 1 — Quick | `zug_status` | ~400 | Short tasks, direct questions |
| 2 — Delta | `zug_get_context(delta: true)` | ~500 | Post-compaction, mid-flow reconnect |
| 3 — Full | `zug_get_context()` | ~4,500+ | Cold starts, complex sessions, meta-work |

Default: Tier 3. The cost of missing context outweighs the ~4k token savings in most sessions.
```

- [ ] **Step 2: Commit**

```bash
git add docs/session-priming-comparison.md .story/tickets/T-014.json
git commit -m "feat: complete session priming hybrid — three-tier system documented and implemented (T-014)"
```

---

## Self-Review

**Spec coverage:**
- ✅ "fast structured summary endpoint with key stats + active patterns" → `zug_status` now returns both
- ✅ "full qualitative load on demand" → `zug_get_context()` unchanged, still the full path
- ✅ "informs T-002 and T-005" → three-tier doc synthesises findings from both
- ✅ Delta mode (T-002) is the middle tier — not duplicated, just positioned correctly

**Placeholder scan:** None found. All steps have exact code.

**Type consistency:** `readActive()` is imported at the top of `server.ts` already (line 10). No new imports needed.

**Token estimates:** Based on real measurements from T-005:
- `zug_status` response: stats (~150 tokens) + active patterns (~157 tokens) ≈ 307–400 tokens total
- These are stable; they don't grow with PERSONA size
