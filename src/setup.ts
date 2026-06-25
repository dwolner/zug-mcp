import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

export interface DetectedAgents {
  claude: boolean;
  cursor: boolean;
  windsurf: boolean;
}

export interface SetupOptions {
  claude?: boolean;
  cursor?: boolean;
  windsurf?: boolean;
  home?: string;
  dataDir?: string;
  quiet?: boolean;
}

// Embedded at build time — prompts/ is not included in the npm package.
const ZUG_RULE_CONTENT = `# Zug — Always Present

You are always Zug, a learning and thinking companion (havruta in the Jewish tradition). Zug means "pair" in Hebrew. The pair is the point.

## Always On

Zug runs in every session — coding, learning, deciding, anything. Your presence adapts to context, but your observation never stops.

## Session Gates

### Session Start Gate

HARD GATE: When a new session begins, call the appropriate tier in the SAME turn as any
other skill's first call — parallel, not after the skill's guard resolves. Never deferred.

Choose the tier that matches the session:

**Tier 1 — Quick orientation** (\`zug_status\`): ~400 tokens
→ Use when: short task, user jumps straight to a specific question, no need for deep calibration
→ Returns: stats + active patterns. Enough to set a behavioral frame.

**Tier 2 — Delta** (\`zug_get_context\` with \`delta: true\`): ~500 tokens
→ Use when: resuming after compaction, reconnecting mid-flow
→ Returns: active patterns + last session summary + new observations since last session end

**Tier 3 — Full context** (\`zug_get_context\`): ~4,500 tokens (grows with PERSONA)
→ Use when: cold start with complex or open-ended session, meta-work on Zug itself
→ Returns: active patterns + full cognitive fingerprint + playbook

**Default for uncertainty:** Tier 3. The cost of missing context outweighs the token savings.

→ What does the Active Patterns block contain?
  (If absent: early session — proceed without a behavioral frame)
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

Something notable happens → ROUTE it (don't just ask "is this new?"):

→ **New or contradicting** a PERSONA pattern (confidence med/high)? → \`zug_save_observation\`. *[discovery]*
→ **An evolution, exception, finer nuance, or second-order interaction** of a known pattern? → \`zug_save_observation\`. As the PERSONA matures these are HIGHER-value than first-time observations — capture them. *[refinement]*
→ **A clean recurrence** of a known pattern? → \`zug_reinforce_observation\` (strengthens it, surfaces lesson candidates). NEVER silently drop a recurring pattern as "already known." *[reinforcement]*
→ **Only if truly redundant or trivial** → continue without saving.

A robust PERSONA is a reason to shift WHAT you capture (discovery → refinement + reinforcement), NOT a reason to go quiet. "Already known" is a routing signal to reinforce, not a stop signal. If a session ends with zero saves AND zero reinforces, you almost certainly under-observed — observation never stops, it only matures.

Use session_id format: \`YYYY-MM-DD-{topic}\` (e.g. \`2026-04-24-learning-companion\`)

### Session End Gate

Wind-down detected (shorter responses, topic closing, "thanks", silence):
→ Is there a summary worth writing?
→ Write one-paragraph summary
→ Call \`zug_end_session\` with session_id and summary
→ Done

## Honest Socratic

You know things. When you ask "what do you think?" you're not pretending. You're choosing to hear their thinking first. Say so when relevant: "I have a take — but what's yours first?" Never fake ignorance.

## The ZUG

You + this human = something neither produces alone. That's the mission. Long-term success: they start asking the questions you would have asked. Then you level up the challenge.

---
*Full system prompt: ~/.claude/zug-system-prompt.md*
`;

// Embedded at build time — templates/ is not included in the npm package.
const PERSONA_TEMPLATE_CONTENT = `# Cognitive Fingerprint

*This is your starting point. Zug will refine and extend it from real sessions. Write honestly — the more accurate this is, the faster the relationship becomes useful.*

*Delete these instructions and fill in the sections below. A few sentences per section is enough.*

---

## How I construct arguments

*Do you start from principles and work down? Or from examples and work up? Do you think out loud or arrive with conclusions? Do you need to explain something to understand it?*

[Write here]

## Where I tend to get stuck

*What kinds of problems slow you down? Abstraction? Details? Knowing when to stop researching and decide? Finishing things you've started?*

[Write here]

## What genuinely excites me

*What topics, ideas, or types of problems make you lose track of time? What do you find yourself reading about when no one's watching?*

[Write here]

## How I handle being wrong

*Do you update quickly when shown evidence? Resist and then come around? Need time to sit with it? Get defensive?*

[Write here]

## What I'm currently working on or learning

*Projects, topics, skills, questions you're actively exploring.*

[Write here]

## Anything else worth knowing

*Communication style, learning preferences, context about your work or life that shapes how you think.*

[Write here]
`;

export function detectAgents(opts?: { home?: string }): DetectedAgents {
  const home = opts?.home ?? os.homedir();
  return {
    claude: fs.existsSync(path.join(home, ".claude")),
    cursor: fs.existsSync(path.join(home, ".cursor")),
    windsurf: fs.existsSync(path.join(home, ".codeium", "windsurf")),
  };
}

export function mergeMcpConfig(
  configPath: string,
  entry: Record<string, unknown> = { type: "stdio", command: "zug-mcp", args: [] }
): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let existing: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // ENOENT or malformed JSON — start fresh
  }

  if (typeof existing.mcpServers !== "object" || existing.mcpServers === null) {
    existing.mcpServers = {};
  }
  (existing.mcpServers as Record<string, unknown>).zug = entry;

  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}

interface HookEntry {
  matcher: string;
  hooks: Array<{ type: string; command: string }>;
}

interface ClaudeSettings {
  hooks?: {
    PreCompact?: HookEntry[];
    SessionStart?: HookEntry[];
    SessionEnd?: HookEntry[];
    [k: string]: HookEntry[] | undefined;
  };
  [k: string]: unknown;
}

export function mergeClaudeHooks(settingsPath: string, zugBin: string): void {
  let settings: ClaudeSettings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
  } catch { /* fresh */ }
  if (!settings.hooks) settings.hooks = {};

  const dropZug = (arr: HookEntry[] = [], needle: string) =>
    arr.filter((h) => !h.hooks?.some((e) => e.command?.includes(needle)));

  // PreCompact -> push (durability checkpoint). stdout not injected; side effect only.
  settings.hooks.PreCompact = dropZug(settings.hooks.PreCompact, "zug compact");
  settings.hooks.PreCompact.push({ matcher: "", hooks: [{ type: "command", command: `${zugBin} compact` }] });

  // SessionStart: cold start (startup) pulls; compaction-resume (compact) reloads.
  settings.hooks.SessionStart = dropZug(dropZug(settings.hooks.SessionStart, "zug resume"), "zug pull");
  settings.hooks.SessionStart.push({ matcher: "startup", hooks: [{ type: "command", command: `${zugBin} pull` }] });
  settings.hooks.SessionStart.push({ matcher: "compact", hooks: [{ type: "command", command: `${zugBin} resume` }] });

  // SessionEnd: push once when the session terminates.
  settings.hooks.SessionEnd = dropZug(settings.hooks.SessionEnd, "zug push");
  settings.hooks.SessionEnd.push({ matcher: "", hooks: [{ type: "command", command: `${zugBin} push` }] });

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

function resolveZugBin(): string {
  try {
    return execSync("which zug", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "zug";
  }
}

export async function runSetup(opts?: SetupOptions): Promise<void> {
  const home = opts?.home ?? os.homedir();
  const dataDir = opts?.dataDir ?? path.join(home, ".zug");
  const quiet = opts?.quiet ?? false;

  const hasExplicit = opts?.claude !== undefined || opts?.cursor !== undefined || opts?.windsurf !== undefined;
  const targets: DetectedAgents = hasExplicit
    ? { claude: opts?.claude ?? false, cursor: opts?.cursor ?? false, windsurf: opts?.windsurf ?? false }
    : detectAgents({ home });

  fs.mkdirSync(dataDir, { recursive: true });
  if (!quiet) console.log(`✓ Zug data dir: ${dataDir}`);

  const personaPath = path.join(dataDir, "PERSONA.md");
  if (!fs.existsSync(personaPath)) {
    fs.writeFileSync(personaPath, PERSONA_TEMPLATE_CONTENT, "utf-8");
    if (!quiet) console.log("✓ Zug: created PERSONA.md — run 'zug onboard' to seed your cognitive fingerprint");
  }

  if (targets.claude) {
    mergeMcpConfig(path.join(home, ".claude.json"));
    if (!quiet) console.log("✓ Claude Code: updated ~/.claude.json");

    const rulesDir = path.join(home, ".claude", "rules");
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, "zug.md"), ZUG_RULE_CONTENT, "utf-8");
    if (!quiet) console.log("✓ Claude Code: wrote ~/.claude/rules/zug.md");

    try {
      const zugBin = resolveZugBin();
      mergeClaudeHooks(path.join(home, ".claude", "settings.json"), zugBin);
      if (!quiet) console.log("✓ Claude Code: registered SessionStart, SessionEnd, and PreCompact hooks");
    } catch {
      if (!quiet) console.log("⚠ Claude Code: could not register hooks — add manually to ~/.claude/settings.json");
    }
  }

  if (targets.cursor) {
    mergeMcpConfig(path.join(home, ".cursor", "mcp.json"));
    if (!quiet) console.log("✓ Cursor: updated ~/.cursor/mcp.json");
  }

  if (targets.windsurf) {
    mergeMcpConfig(path.join(home, ".codeium", "windsurf", "mcp_config.json"));
    if (!quiet) console.log("✓ Windsurf: updated ~/.codeium/windsurf/mcp_config.json");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    if (!quiet) console.log(
      "⚠ Zug: ANTHROPIC_API_KEY not set — PERSONA.md synthesis won't run. " +
      "Set it (or add to ~/.zug/.env) for automatic distillation and long-term scaling."
    );
  }
}
