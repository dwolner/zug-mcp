import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import os from "os";

const ENV_FILE = path.join(os.homedir(), ".zug", ".env");
const PERSONA_LINE_LIMIT = 600;

function loadApiKey(): string | null {
  // Check environment first
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  // Fall back to ~/.zug/.env
  if (fs.existsSync(ENV_FILE)) {
    const content = fs.readFileSync(ENV_FILE, "utf-8");
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }

  return null;
}

export interface SynthesisInput {
  currentPersona: string;
  currentPlaybook: string;
  sessionSummary: string;
  observations: Array<{
    type: string;
    observation: string;
    confidence: string;
  }>;
}

export interface SynthesisResult {
  persona: string;
  playbook: string;
  active: string;
}

export async function synthesize(input: SynthesisInput): Promise<SynthesisResult | null> {
  const apiKey = loadApiKey();
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const personaLineCount = input.currentPersona.split("\n").length;
  const trimInstruction = personaLineCount > PERSONA_LINE_LIMIT
    ? `\n\nIMPORTANT: The persona is ${personaLineCount} lines (limit: ${PERSONA_LINE_LIMIT}). Summarize the oldest dated sections to reduce length while preserving key insights. Newer observations take priority.`
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

Now write 3-5 active patterns for the NEXT session. These are instructions for Zug — how to adapt its approach in the next session based on what worked and didn't in this one.

Before each pattern:
→ Is this directly supported by an observation from PERSONA or this session?
→ Is this specific enough to change Zug's behavior, or is it generic advice?
→ Only if both: include it

Format each as a direct behavioral instruction to Zug: "when X → do Y" or "don't Z until W"

<ACTIVE>
(active patterns, one per line)
</ACTIVE>`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const personaMatch = text.match(/<PERSONA>\n?([\s\S]*?)\n?<\/PERSONA>/);
  const playbookMatch = text.match(/<PLAYBOOK>\n?([\s\S]*?)\n?<\/PLAYBOOK>/);
  const activeMatch = text.match(/<ACTIVE>\n?([\s\S]*?)\n?<\/ACTIVE>/);

  if (!personaMatch || !playbookMatch) return null;

  return {
    persona: personaMatch[1].trim(),
    playbook: playbookMatch[1].trim(),
    active: activeMatch ? activeMatch[1].trim() : "",
  };
}
