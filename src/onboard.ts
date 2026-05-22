import readline from "readline";
import Anthropic from "@anthropic-ai/sdk";
import { loadApiKey, HAIKU_MODEL } from "./api-key.js";
import { readPersona, writePersona } from "./storage.js";

const QUESTIONS = [
  "How do you think through problems — from principles down to examples, or from examples up to patterns?",
  "What topics or types of problems genuinely excite you — what makes you lose track of time?",
  "Where do you tend to get stuck? (e.g. abstraction, details, starting, finishing, deciding)",
  "When you're wrong about something, how do you usually handle it?",
  "What are you currently working on or learning?",
];

const SECTION_HEADERS = [
  "## How you construct arguments",
  "## What excites you",
  "## Where you get stuck",
  "## How you handle being wrong",
  "## What you're working on",
];

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`\n${question}\n> `, (answer) => resolve(answer.trim()));
  });
}

function buildPlainMarkdown(answers: string[]): string {
  const sections = SECTION_HEADERS.map((header, i) => {
    const answer = answers[i] || "(skipped)";
    return `${header}\n\nYou said: ${answer}`;
  });
  return `# Cognitive Fingerprint\n\n${sections.join("\n\n")}`;
}

async function synthesizePersona(answers: string[]): Promise<string | null> {
  const apiKey = loadApiKey();
  if (!apiKey) return null;

  const answersBlock = QUESTIONS.map((q, i) => `Q${i + 1} (${SECTION_HEADERS[i].replace("## ", "")}): ${answers[i] || "(no answer)"}`).join("\n");

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: "You output only the PERSONA.md content. No XML tags, no preamble, no commentary.",
      messages: [{
        role: "user",
        content: `Write the first page of a cognitive fingerprint for someone you will work with as a learning companion.

Based on their answers to 5 questions, write a PERSONA.md that:
- Captures how they think, not just what they know
- Uses direct, observational language (no flattery)
- Follows this structure exactly: ${SECTION_HEADERS.join(" / ")}
- Is concise: 3-5 sentences per section

${answersBlock}`,
      }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return text.trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  if (!process.stdin.isTTY) {
    console.log("[zug] Non-interactive environment — skipping onboarding.");
    process.exit(0);
  }

  const existing = readPersona();
  if (existing && !existing.includes("[Write here]")) {
    console.log("\n[zug] PERSONA.md already has content. Skipping onboarding.");
    console.log("      Run `pnpm onboard` manually if you want to re-seed it.");
    process.exit(0);
  }

  console.log("\n[zug] Welcome. Zug is a learning companion that builds a cognitive fingerprint");
  console.log("      of how you think, so each session can build on the last.");
  console.log("\n      Answer 5 quick questions to seed your fingerprint.");
  console.log("      (Press Enter to skip any question.)\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answers: string[] = [];

  for (let i = 0; i < QUESTIONS.length; i++) {
    console.log(`Question ${i + 1} of ${QUESTIONS.length}`);
    const answer = await ask(rl, QUESTIONS[i]);
    answers.push(answer);
  }

  rl.close();

  const hasAnswers = answers.some((a) => a.length > 0);
  if (!hasAnswers) {
    console.log("\n[zug] No answers provided — skipping PERSONA.md creation.");
    process.exit(0);
  }

  console.log("\n[zug] Writing your cognitive fingerprint...");

  const synthesized = await synthesizePersona(answers);
  const content = synthesized ?? buildPlainMarkdown(answers);
  const method = synthesized ? "synthesized by Haiku" : "saved from your answers";

  writePersona(content);
  console.log(`[zug] PERSONA.md created (${method}).`);
  console.log("      Zug will refine it as sessions accumulate.");
}

main().catch((err) => {
  console.error("[zug] Onboarding error:", err);
  process.exit(1);
});
