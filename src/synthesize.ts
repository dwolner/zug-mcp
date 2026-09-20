import Anthropic from "@anthropic-ai/sdk";
import { loadApiKey, HAIKU_MODEL } from "./api-key.js";
import { recordSynthesisOutcome, archiveDocument } from "./storage.js";

/**
 * Haiku output throughput measured during the ISS-045 investigation: 3,790 tokens in 52.9s.
 * Kept as a named constant so the timeout and output budgets below stay derivable from evidence
 * rather than from independent guesses.
 */
export const OBSERVED_OUTPUT_TOKENS_PER_SEC = 72;

/**
 * Output budget for ONE document call.
 *
 * ISS-046 raised this from 4,096 after the combined corpus needed ~4,006 tokens to re-emit. That
 * bought six months: by 2026-09-20 the corpus needed 18,438 tokens and every synthesis truncated
 * again. Raising it a third time was not available — the timeout invariant asserted below caps it
 * at SYNTHESIS_TIMEOUT_MS * tok/s = 21,600, which at the measured growth rate of ~113 tokens/day
 * was about four weeks of headroom.
 *
 * ISS-054 changes what this budget is measured against instead of how big it is: synthesis now
 * issues one call per document, so the ceiling applies to PERSONA or PLAYBOOK alone rather than to
 * their sum. Growth past it is handled by compaction below, not by moving the number.
 */
export const MAX_OUTPUT_TOKENS = 16_384;

/**
 * Compaction thresholds (ISS-054).
 *
 * TRIGGER is the size at which a document must be compacted before it is synthesized; TARGET is
 * what compaction aims for. The gap between them is deliberate: compacting only back to the
 * trigger would re-fire every session from then on.
 *
 * ISS-046 attempted this as a sentence in the synthesis prompt ("Summarize the oldest dated
 * sections..."). That instruction was present in every prompt from roughly July onward while the
 * corpus grew from the 9,830-token trigger to 18,438 — it never bounded anything, and nothing
 * measured whether it had. Compaction is therefore a separate call with one job, and its effect is
 * verified against the document it produced.
 */
export const COMPACTION_TRIGGER_TOKENS = Math.floor(MAX_OUTPUT_TOKENS * 0.6);
export const COMPACTION_TARGET_TOKENS = Math.floor(MAX_OUTPUT_TOKENS * 0.4);

/**
 * Estimate the output tokens needed to re-emit a document verbatim (~4 bytes/token).
 * Deliberately crude: it only has to be right enough to trip the guardrail before the ceiling.
 */
export function estimateDocTokens(doc: string): number {
  return Math.ceil(doc.length / 4);
}

/**
 * Wall-clock budget for one synthesis call (ISS-045).
 *
 * Synthesis re-emits a document verbatim, so its output scales with the corpus, not with the size
 * of the change. Measured against a 118-line PERSONA: 3,790 output tokens at ~72 tok/s = 52.9s.
 * The previous 30s budget could therefore never be met, and every call on the Fly server timed out
 * silently for three months. This is deliberately ~5x the measured worst case so ordinary corpus
 * growth does not reintroduce the failure.
 */
export const SYNTHESIS_TIMEOUT_MS = 300_000;

export interface SynthesisInput {
  currentPersona: string;
  currentPlaybook: string;
  sessionSummary: string;
  observations: Array<{
    type: string;
    observation: string;
    confidence: string;
  }>;
  reinforcedPatterns?: Array<{ text: string; count: number }>;
}

export interface SynthesisResult {
  persona: string;
  playbook: string;
  active: string;
  /**
   * True only when every document was regenerated successfully.
   *
   * Callers advance the synthesis cursor and archive observations off this flag, never off a
   * non-null result: on a partial run the failed document is the CURRENT text handed back
   * unchanged, so its share of this session's observations has not been absorbed. Advancing there
   * would drop them — the ISS-050 failure, reintroduced through the partial path.
   */
  complete: boolean;
}

/** One document's worth of generation: the parsed text, or why it could not be produced. */
type DocOutcome =
  | { ok: true; text: string; active: string }
  | { ok: false; reason: "truncated" | "malformed" }
  | { ok: false; reason: "threw"; error: unknown };

const SYSTEM_PROMPT =
  "You output only the requested XML blocks. No preamble, no questions, no commentary. " +
  "If nothing changes, return the existing content verbatim inside the XML tags.";

/**
 * Issue one streamed call with `prefill` already opened, and return the assembled text with the
 * prefill prepended so the caller's regex sees a complete document.
 *
 * Streamed rather than a single blocking create: a ~53s generation held open as one non-streaming
 * request is what ISS-045 was. finalMessage() resolves to the assembled Message.
 */
async function callModel(
  client: Anthropic,
  prompt: string,
  prefill: string,
): Promise<{ text: string; truncated: boolean }> {
  const response = await client.messages.stream({
    model: HAIKU_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: prefill },
    ],
  }).finalMessage();

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return { text: prefill + raw, truncated: response.stop_reason === "max_tokens" };
}

function extract(text: string, tag: string): string | null {
  const m = text.match(new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`));
  return m ? m[1].trim() : null;
}

/**
 * Shrink one document to COMPACTION_TARGET_TOKENS, verify that it actually shrank, and archive the
 * pre-compaction text.
 *
 * Returns the compacted document, or null when compaction did not work — in which case the caller
 * keeps the original. Losing content to a compaction that silently failed would be worse than
 * carrying an oversized document for another session.
 */
async function compactDocument(
  client: Anthropic,
  kind: "persona" | "playbook",
  doc: string,
): Promise<string | null> {
  const label = kind === "persona" ? "PERSONA.md" : "PLAYBOOK.md";
  const targetBytes = COMPACTION_TARGET_TOKENS * 4;

  const prompt = `You are compacting ${label}, a long-lived document about one person, because it has outgrown the budget that keeps it maintainable.

It is currently ${doc.length} bytes. Rewrite it to UNDER ${targetBytes} bytes.

## What to preserve
- Anything marked as reinforced, load-bearing, or observed across multiple sessions
- EVERY "## " section heading that exists. Compact the content inside a section; never drop a
  section, never merge two sections together, never add one
- Any [Nx] reinforcement count, copied exactly. These are recorded data, not your judgement —
  never raise one, never invent one, and never promote an entry to a higher count
- Distinct patterns — two entries that say different things both survive

## What to cut
- Verbatim quotes: keep the claim, drop the transcript
- Single-occurrence entries that restate a pattern already covered elsewhere — merge them into it
- Session-specific narrative detail that no longer changes how to work with this person
- Hedging, repetition, and any entry that has become generic advice

Do not invent anything. Do not add commentary. Return only the rewritten document.

## Current ${label}
${doc}

Return the rewritten document inside <DOC></DOC> tags.`;

  let compacted: string | null;
  try {
    const { text, truncated } = await callModel(client, prompt, "<DOC>");
    compacted = truncated ? null : extract(text, "DOC");
  } catch {
    // A transport failure here must not take synthesis down with it — the oversized document is
    // still synthesizable, just closer to the ceiling than we would like.
    compacted = null;
  }

  // The verification step ISS-046's prompt instruction never had. A compaction that did not
  // shrink the document is a failure, not a no-op, and it is reported as one.
  if (!compacted || estimateDocTokens(compacted) > COMPACTION_TRIGGER_TOKENS) {
    console.warn(
      `[zug] Compaction of ${label} did not bring it under ${COMPACTION_TRIGGER_TOKENS} tokens — ` +
      `keeping the original (${estimateDocTokens(doc)} tokens).`,
    );
    return null;
  }

  archiveDocument(kind, doc);
  return compacted;
}

/** Compact `doc` if it is over the trigger. Returns the text to synthesize and whether it failed. */
async function prepareDocument(
  client: Anthropic,
  kind: "persona" | "playbook",
  doc: string,
): Promise<{ doc: string; compactionFailed: boolean }> {
  if (estimateDocTokens(doc) <= COMPACTION_TRIGGER_TOKENS) {
    return { doc, compactionFailed: false };
  }
  const compacted = await compactDocument(client, kind, doc);
  return compacted === null
    ? { doc, compactionFailed: true }
    : { doc: compacted, compactionFailed: false };
}

function observationsBlock(input: SynthesisInput): string {
  return input.observations.length > 0
    ? input.observations.map((o) => `- [${o.type}/${o.confidence}] ${o.observation}`).join("\n")
    : "No observations this session.";
}

function personaPrompt(input: SynthesisInput, persona: string): string {
  // The [Nx] counts come from reinforcements.jsonl. A synthesis run that "promotes" them is
  // fabricating evidence of recurrence — observed doing exactly that ([1x] 17 -> 1, [2x] 6 -> 15)
  // before this instruction existed — and inflated counts feed straight back into what Zug treats
  // as load-bearing.
  const reinforced = input.reinforcedPatterns?.length
    ? `\nINPUT — Reinforced patterns (recorded counts; treat these as load-bearing)\n${input.reinforcedPatterns.map((p) => `- [${p.count}x] ${p.text}`).join("\n")}\n\nThe [Nx] counts are recorded data, not your judgement. Copy each count exactly as given. Never raise a count, never invent one, and leave the count on any existing entry that is absent from this list unchanged.\n`
    : "";

  return `You are maintaining a cognitive fingerprint for a person you work with as a learning companion (havruta). Update PERSONA.md based on a new session.

## Before adding anything new to PERSONA:
→ Quote the exact text from this session's observations that supports it
→ Is that a direct observation, or an inference?
→ Only if direct: add it

## Before removing or significantly rewording an existing PERSONA line:
→ Quote the exact observation from this session that contradicts it
→ Only if you have an explicit contradiction: remove or reword it
→ If uncertain: leave it and add a dated note below it

## Structural rules:
- Integrate new observations into existing sections rather than appending dated entries
- Keep the tone direct and observational, not flattering
- PERSONA.md is about THIS PERSON — how they think, what they do, where they get stuck

## Current PERSONA.md
${persona || "*Empty — this is the first synthesis.*"}

═══ INPUT FOR THIS UPDATE — NOT PART OF THE DOCUMENT ═══
Everything below this line is evidence. Never copy these headings, or their wording, into the
document you return. PERSONA.md's own sections are the ones listed above and nowhere else.
${reinforced}
INPUT — Session summary
${input.sessionSummary}

INPUT — Observations from this session
${observationsBlock(input)}
═══ END OF INPUT ═══

## Your Task
Return the full updated PERSONA.md. You MUST produce the complete document even if nothing changes — return the existing content verbatim if no updates are warranted.

<PERSONA>
(full updated PERSONA.md content)
</PERSONA>

Then write 3-5 active patterns for the NEXT session. These are instructions for Zug — how to adapt its approach next session based on what worked and didn't in this one.

Before each pattern:
→ Is this directly supported by an observation from PERSONA or this session?
→ Is this specific enough to change Zug's behavior, or is it generic advice?
→ Only if both: include it

Format each as a direct behavioral instruction to Zug: "when X → do Y" or "don't Z until W"

<ACTIVE>
(active patterns, one per line)
</ACTIVE>`;
}

function playbookPrompt(input: SynthesisInput, playbook: string): string {
  return `You are maintaining PLAYBOOK.md — what works in learning sessions with one particular person, as their havruta. Update it based on a new session.

## Before adding to PLAYBOOK:
→ Is this a universal pattern across sessions, or specific to this session?
→ Only if universal: add it

## Before updating PLAYBOOK:
→ Does this session's evidence strengthen, weaken, or nuance the existing entry?
→ Only if it changes the meaning: update it

## Structural rules:
- Integrate new evidence into existing sections rather than appending dated entries
- Keep the tone direct and observational, not flattering
- PLAYBOOK.md is about WHAT WORKS — universal patterns for effective learning sessions

## Current PLAYBOOK.md
${playbook || "*Empty — no playbook yet.*"}

═══ INPUT FOR THIS UPDATE — NOT PART OF THE DOCUMENT ═══
Everything below this line is evidence. Never copy these headings, or their wording, into the
document you return. PLAYBOOK.md's own sections are the ones listed above and nowhere else.

INPUT — Session summary
${input.sessionSummary}

INPUT — Observations from this session
${observationsBlock(input)}
═══ END OF INPUT ═══

## Your Task
Return the full updated PLAYBOOK.md. You MUST produce the complete document even if nothing changes — return the existing content verbatim if no updates are warranted.

<PLAYBOOK>
(full updated PLAYBOOK.md content)
</PLAYBOOK>`;
}

async function generateDocument(
  client: Anthropic,
  prompt: string,
  tag: "PERSONA" | "PLAYBOOK",
): Promise<DocOutcome> {
  let text: string;
  let truncated: boolean;
  try {
    ({ text, truncated } = await callModel(client, prompt, `<${tag}>`));
  } catch (error) {
    return { ok: false, reason: "threw", error };
  }

  // Truncation and a malformed response both used to land on the same silent `return null`, which
  // is why ISS-046 was invisible until it was reproduced by hand. stop_reason tells them apart.
  const body = extract(text, tag);
  if (!body) {
    if (truncated) {
      console.warn(
        `[zug] Synthesis truncated — ${tag} hit the ${MAX_OUTPUT_TOKENS}-token budget before ` +
        `closing </${tag}>. Compaction should have prevented this; check the compaction outcome.`,
      );
      return { ok: false, reason: "truncated" };
    }
    console.warn(`[zug] Synthesis skipped — model did not produce a ${tag} block.\n${text.slice(0, 300)}`);
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, text: body, active: extract(text, "ACTIVE") ?? "" };
}

export async function synthesize(input: SynthesisInput): Promise<SynthesisResult | null> {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.warn(
      "[zug] Warning: ANTHROPIC_API_KEY is not set — PERSONA.md synthesis skipped. " +
      "Without synthesis, PERSONA.md grows unboundedly. " +
      "Set ANTHROPIC_API_KEY (or add to ~/.zug/.env) to enable automatic distillation."
    );
    recordSynthesisOutcome("no-api-key");
    return null;
  }

  const client = new Anthropic({ apiKey, timeout: SYNTHESIS_TIMEOUT_MS, maxRetries: 2 });

  // Compact first, so each document is synthesized at a size that can be re-emitted.
  const [persona, playbook] = await Promise.all([
    prepareDocument(client, "persona", input.currentPersona),
    prepareDocument(client, "playbook", input.currentPlaybook),
  ]);
  const compactionFailures = [
    persona.compactionFailed ? "persona" : null,
    playbook.compactionFailed ? "playbook" : null,
  ].filter((s): s is string => s !== null);

  // One call per document. Independent, so they run concurrently and fail independently.
  const [personaOut, playbookOut] = await Promise.all([
    generateDocument(client, personaPrompt(input, persona.doc), "PERSONA"),
    generateDocument(client, playbookPrompt(input, playbook.doc), "PLAYBOOK"),
  ]);

  const failures: Array<{ kind: string; outcome: Extract<DocOutcome, { ok: false }> }> = [];
  if (!personaOut.ok) failures.push({ kind: "persona", outcome: personaOut });
  if (!playbookOut.ok) failures.push({ kind: "playbook", outcome: playbookOut });

  // Every document failed: nothing was produced, so report the shared reason and behave exactly as
  // before ISS-054 — including rethrowing a transport error so the queue logs it too.
  if (failures.length === 2) {
    const thrown = failures.find((f) => f.outcome.reason === "threw");
    if (thrown) {
      const err = (thrown.outcome as Extract<DocOutcome, { reason: "threw" }>).error;
      const msg = err instanceof Error ? err.message : String(err);
      recordSynthesisOutcome(/timed out|timeout/i.test(msg) ? "timeout" : "error", msg);
      throw err;
    }
    const anyTruncated = failures.some((f) => f.outcome.reason === "truncated");
    recordSynthesisOutcome(
      anyTruncated ? "truncated" : "malformed",
      anyTruncated
        ? `both documents exceeded the ${MAX_OUTPUT_TOKENS}-token budget`
        : "response did not contain PERSONA/PLAYBOOK blocks",
    );
    return null;
  }

  if (failures.length === 1) {
    const { kind, outcome } = failures[0];
    const detail = outcome.reason === "threw"
      ? `${kind} call failed: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`
      : `${kind} ${outcome.reason}; the other document was updated`;
    recordSynthesisOutcome("partial", detail);
  } else if (compactionFailures.length > 0) {
    // Synthesis worked, but the documents are still over the trigger and will keep drifting toward
    // the ceiling. Silence here is what let the corpus reach 18,438 tokens unnoticed.
    recordSynthesisOutcome(
      "compaction-failed",
      `${compactionFailures.join(" and ")} still above ${COMPACTION_TRIGGER_TOKENS} tokens after compaction`,
    );
  } else {
    recordSynthesisOutcome("ok");
  }

  return {
    persona: personaOut.ok ? personaOut.text : persona.doc,
    playbook: playbookOut.ok ? playbookOut.text : playbook.doc,
    active: personaOut.ok ? personaOut.active : "",
    complete: failures.length === 0,
  };
}
