import Anthropic from "@anthropic-ai/sdk";
import { loadApiKey, HAIKU_MODEL } from "./api-key.js";
import { recordSynthesisOutcome } from "./storage.js";

/**
 * Haiku output throughput measured during the ISS-045 investigation: 3,790 tokens in 52.9s.
 * Kept as a named constant so the timeout and output budgets below stay derivable from evidence
 * rather than from independent guesses.
 */
export const OBSERVED_OUTPUT_TOKENS_PER_SEC = 72;

/**
 * Output budget for one synthesis call (ISS-046).
 *
 * Synthesis re-emits PERSONA + PLAYBOOK + ACTIVE verbatim, so required output tracks corpus size.
 * The live corpus needed ~4,006 tokens against a 4,096 ceiling -- 90 tokens of headroom -- so the
 * first session that added a few lines truncated mid-document and synthesis returned null.
 * This is ~4x the measured corpus, and the invariant that it stays generatable inside
 * SYNTHESIS_TIMEOUT_MS is asserted in the tests rather than left to be rediscovered.
 */
export const MAX_OUTPUT_TOKENS = 16_384;

/**
 * Fraction of the output budget the corpus may occupy before the model is told to summarize.
 * The trim instruction has to fire while the documents can STILL be re-emitted -- an instruction
 * to shorten them is useless once emitting them at all no longer fits.
 */
const TRIM_TRIGGER_RATIO = 0.6;

/** Rough allowance for the ACTIVE block, which is generated rather than passed in. */
const ACTIVE_BLOCK_ALLOWANCE_TOKENS = 300;

/**
 * Estimate the output tokens needed to re-emit the documents verbatim (~4 bytes/token).
 * Deliberately crude: it only has to be right enough to trip the guardrail before the ceiling.
 */
export function estimateReEmitTokens(persona: string, playbook: string): number {
  return Math.ceil((persona.length + playbook.length) / 4) + ACTIVE_BLOCK_ALLOWANCE_TOKENS;
}

/**
 * Wall-clock budget for one synthesis call (ISS-045).
 *
 * Synthesis re-emits PERSONA + PLAYBOOK + ACTIVE verbatim, so its output scales with the corpus,
 * not with the size of the change. Measured against a 118-line PERSONA: 3,790 output tokens at
 * ~72 tok/s = 52.9s. The previous 30s budget could therefore never be met, and every call on the
 * Fly server timed out silently for three months. This is deliberately ~5x the measured worst case
 * so ordinary corpus growth does not reintroduce the failure.
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

  const reEmitTokens = estimateReEmitTokens(input.currentPersona, input.currentPlaybook);
  const trimInstruction = reEmitTokens > MAX_OUTPUT_TOKENS * TRIM_TRIGGER_RATIO
    ? `\n\nIMPORTANT: These documents need roughly ${reEmitTokens} tokens to reproduce, against a ${MAX_OUTPUT_TOKENS} token output budget. Summarize the oldest dated sections to reduce length while preserving key insights. Newer observations take priority.`
    : "";

  const obsBlock = input.observations.length > 0
    ? input.observations.map((o) => `- [${o.type}/${o.confidence}] ${o.observation}`).join("\n")
    : "No observations this session.";

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

## Structural rules:
- Integrate new observations into existing sections rather than appending dated entries
- Keep the tone direct and observational, not flattering
- PERSONA.md is about THIS PERSON — how they think, what they do, where they get stuck
- PLAYBOOK.md is about WHAT WORKS — universal patterns for effective learning sessions${trimInstruction}

## Current PERSONA.md
${input.currentPersona || "*Empty — this is the first synthesis.*"}

${input.reinforcedPatterns?.length
  ? `## Reinforced patterns (observed across multiple sessions — treat these as load-bearing)\n${input.reinforcedPatterns.map((p) => `- [${p.count}x] ${p.text}`).join("\n")}\n`
  : ""}## Current PLAYBOOK.md
${input.currentPlaybook || "*Empty — no playbook yet.*"}

## Session Summary
${input.sessionSummary}

## Observations from This Session
${obsBlock}

## Your Task
Return three outputs in exactly this format. You MUST always produce the full XML output even if nothing changes — return the existing content verbatim if no updates are warranted.

<PERSONA>
(full updated PERSONA.md content)
</PERSONA>

<PLAYBOOK>
(full updated PLAYBOOK.md content)
</PLAYBOOK>

Now write 3-5 active patterns for the NEXT session. These are instructions for Zug — how to adapt its approach in the next session based on what worked and didn't in this one.

Before each pattern:
→ Is this directly supported by an observation from PERSONA or this session?
→ Is this specific enough to change Zug's behavior, or is it generic advice?
→ Only if both: include it

Format each as a direct behavioral instruction to Zug: "when X → do Y" or "don't Z until W"

<ACTIVE>
(active patterns, one per line)
</ACTIVE>`;

  // Streamed rather than a single blocking create: a ~53s generation held open as one
  // non-streaming request is what ISS-045 was. finalMessage() resolves to the assembled Message.
  let response;
  try {
    response = await client.messages.stream({
      model: HAIKU_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
    system: "You output only the requested XML blocks. No preamble, no questions, no commentary. If nothing changes, return the existing content verbatim inside the XML tags.",
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: "<PERSONA>" },
    ],
    }).finalMessage();
  } catch (err) {
    // The failure mode this whole investigation started from. Record it before rethrowing, so the
    // queue's catch still logs it and the outcome survives the process either way.
    const msg = err instanceof Error ? err.message : String(err);
    recordSynthesisOutcome(/timed out|timeout/i.test(msg) ? "timeout" : "error", msg);
    throw err;
  }

  // Prepend the prefilled assistant turn so regex can match the full XML
  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const text = "<PERSONA>" + raw;

  // Truncation and a malformed response both used to land on the same silent `return null`,
  // which is why ISS-046 was invisible until it was reproduced by hand. stop_reason tells them
  // apart, so say which one happened.
  if (response.stop_reason === "max_tokens") {
    console.warn(
      `[zug] Synthesis truncated — output hit the ${MAX_OUTPUT_TOKENS}-token budget before ` +
      `closing </PERSONA>. The corpus needs ~${reEmitTokens} tokens to reproduce; raise ` +
      `MAX_OUTPUT_TOKENS or shorten PERSONA.md.`
    );
    recordSynthesisOutcome("truncated", `needed ~${reEmitTokens} tokens, budget ${MAX_OUTPUT_TOKENS}`);
    return null;
  }

  const personaMatch = text.match(/<PERSONA>\n?([\s\S]*?)\n?<\/PERSONA>/);
  const playbookMatch = text.match(/<PLAYBOOK>\n?([\s\S]*?)\n?<\/PLAYBOOK>/);
  const activeMatch = text.match(/<ACTIVE>\n?([\s\S]*?)\n?<\/ACTIVE>/);

  if (!personaMatch || !playbookMatch) {
    console.warn(`Synthesis skipped — model did not produce output.\n${text.slice(0, 300)}`);
    recordSynthesisOutcome("malformed", "response did not contain PERSONA/PLAYBOOK blocks");
    return null;
  }

  recordSynthesisOutcome("ok");

  return {
    persona: personaMatch[1].trim(),
    playbook: playbookMatch[1].trim(),
    active: activeMatch ? activeMatch[1].trim() : "",
  };
}
