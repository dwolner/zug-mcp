# Zug OSS Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Zug MCP server installable via `npm install -g zug-mcp && zug setup` with auto-detection and configuration of Claude Code, Cursor, and Windsurf.

**Architecture:** Add a `zug setup` command that detects installed AI agents and writes their MCP config files + `~/.claude/rules/zug.md` for Claude Code. The npm package ships two compiled binaries: `zug` (CLI) and `zug-mcp` (stdio MCP server). The MCP server gains an `instructions` field for non-Claude-Code agent autonomy.

**Tech Stack:** TypeScript/Node.js, `@modelcontextprotocol/sdk` (already installed), Vitest for tests, `pnpm build` → `tsc` for compilation.

---

## File Structure

**New files:**
- `src/setup.ts` — agent detection, config writing, `zug setup` orchestration
- `CONTRIBUTING.md` — dev setup guide for contributors
- `LICENSE` — MIT license text

**Modified files:**
- `package.json` — add `zug-mcp` bin, `files` field, `engines`, `prepublishOnly` script
- `src/cli.ts` — add `setup` and `update` commands; update `status` to show agent config
- `src/server.ts` — add `instructions` string to `createServer()`
- `src/stdio.ts` — pass `instructions` to `McpServer` constructor
- `README.md` — rewrite as public-facing OSS README

**Test files:**
- `src/setup.test.ts` — new: tests for agent detection and config writing

---

## Task 1: Package.json — npm publish setup

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update `bin` entries and add publish fields**

  Replace the current `package.json` bin and add missing fields:

  ```json
  {
    "name": "zug-mcp",
    "version": "1.0.0",
    "description": "The memory and reflection layer for people who work with AI.",
    "main": "dist/stdio.js",
    "bin": {
      "zug": "dist/cli.js",
      "zug-mcp": "dist/stdio.js"
    },
    "files": [
      "dist",
      "LICENSE",
      "README.md"
    ],
    "engines": {
      "node": ">=20"
    },
    "scripts": {
      "build": "tsc",
      "prepublishOnly": "pnpm build",
      "dev": "tsx src/stdio.ts",
      "start:http": "node dist/http.js",
      "typecheck": "tsc --noEmit",
      "merge": "tsx src/merge.ts",
      "synthesize": "tsx src/synthesize-cli.ts",
      "migrate": "bash scripts/migrate.sh",
      "test": "vitest run",
      "test:watch": "vitest",
      "onboard": "tsx src/onboard.ts",
      "cli": "tsx src/cli.ts"
    }
  }
  ```

  Key changes:
  - `bin.zug` → `dist/cli.js` (was `src/cli.ts`, can't ship tsx in npm)
  - `bin.zug-mcp` → `dist/stdio.js` (new — the MCP server binary)
  - `files` → only ship `dist/`, `LICENSE`, `README.md`
  - `engines` → require Node 20+
  - `prepublishOnly` → auto-build before publish

- [ ] **Step 2: Verify the build produces the right output**

  Run: `pnpm build`

  Expected: no errors, `dist/cli.js`, `dist/stdio.js`, etc. exist.

  ```bash
  ls dist/cli.js dist/stdio.js
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add package.json
  git commit -m "build: add zug-mcp bin entry, files field, engines for npm publish"
  ```

---

## Task 2: MIT LICENSE file

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Write the failing test**

  (No test needed for a static text file — skip to implementation.)

- [ ] **Step 2: Create `LICENSE`**

  ```
  MIT License

  Copyright (c) 2026 Daniel Wolner

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add LICENSE
  git commit -m "docs: add MIT license"
  ```

---

## Task 3: MCP server `instructions` field

The MCP `Server` class (which `McpServer` wraps) supports an `instructions` option that is included in the `initialize` response. Any well-behaved MCP client surfaces this to its model context. This is how Zug guides non-Claude-Code agents to call tools autonomously.

**Files:**
- Modify: `src/server.ts`
- Modify: `src/stdio.ts`

- [ ] **Step 1: Write the failing test**

  Add to `src/server.test.ts`, inside the existing describe block:

  ```typescript
  import { createServer } from "./server.js";

  describe("MCP server instructions", () => {
    it("exposes instructions on the underlying server object", () => {
      const server = createServer();
      // McpServer wraps a low-level Server; instructions are on server.server
      const underlying = (server as any).server;
      expect(typeof underlying._instructions).toBe("string");
      expect(underlying._instructions.length).toBeGreaterThan(50);
      expect(underlying._instructions).toContain("zug_get_context");
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `pnpm test -- --reporter=verbose 2>&1 | grep -A3 "MCP server instructions"`

  Expected: FAIL — `_instructions` is undefined.

- [ ] **Step 3: Add `instructions` to `createServer()`**

  In `src/server.ts`, update the `createServer` function signature from:

  ```typescript
  export function createServer(): McpServer {
    const server = new McpServer({ name: "zug", version: "1.0.0" });
  ```

  to:

  ```typescript
  const ZUG_INSTRUCTIONS = `You are connected to Zug, a persistent memory and learning companion for AI-assisted work.

  ## Required behaviors

  **Session start:** Call \`zug_get_context\` as your FIRST tool call in every new session. Do not skip this — it loads the user's cognitive fingerprint, active patterns, and open threads.

  **During the session:** When you notice a meaningful pattern, insight, preference, or mistake — anything that would help future sessions — call \`zug_save_observation\`. Aim for 1-3 observations per session. Do not over-observe; focus on genuinely novel or reinforced patterns.

  **Session end:** When the conversation winds down (shorter responses, "thanks", topic closing, or explicit goodbye), call \`zug_end_session\` with a one-paragraph summary of what happened and what was learned.

  ## Tool reference
  - \`zug_get_context\` — load cognitive fingerprint + playbook (session start)
  - \`zug_save_observation\` — save a pattern, insight, or mistake (mid-session)
  - \`zug_end_session\` — write session log and run synthesis (session end)
  - \`zug_get_recent_sessions\` — re-establish context after a gap
  - \`zug_status\` — quick stats (sessions, observations, persona size)
  - \`zug_create_lesson\` / \`zug_lesson_digest\` / \`zug_lesson_update\` / \`zug_reinforce_lesson\` — named lessons
  - \`zug_open_thread\` / \`zug_close_thread\` / \`zug_get_open_thread\` — carry a question across turns
  - \`zug_growth_summary\` — trend digest across sessions
  - \`zug_reinforce_pattern\` / \`zug_get_top_patterns\` — behavioral pattern tracking
  - \`zug_reasoning_analysis\` — 6-lens parallel cognitive analysis (requires Anthropic API key)`;

  export function createServer(): McpServer {
    const server = new McpServer(
      { name: "zug", version: "1.0.0" },
      { instructions: ZUG_INSTRUCTIONS }
    );
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `pnpm test -- --reporter=verbose 2>&1 | grep -A3 "MCP server instructions"`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/server.ts src/server.test.ts
  git commit -m "feat: add MCP server instructions field for non-Claude-Code agent autonomy"
  ```

---

## Task 4: `src/setup.ts` — agent detection + config writing

This is the heart of `zug setup`. It detects installed agents, reads their existing config files, merges in the Zug MCP server entry, and writes `~/.claude/rules/zug.md` for Claude Code.

**Files:**
- Create: `src/setup.ts`
- Create: `src/setup.test.ts`

### The MCP server entry

Both approaches (merge and write) use this config object:

```typescript
const ZUG_MCP_ENTRY = {
  command: "zug-mcp",
  args: [] as string[],
};
```

### The `~/.claude/rules/zug.md` content

This is the Claude Code rules file that drives autonomous behavior. It must match (or be the basis for) `~/.claude/rules/zug.md` on the user's system.

The content to write is the behavioral rules: call `zug_get_context` on session start, observe mid-session, call `zug_end_session` on wind-down. Write it as a compact version of what currently lives in `~/.claude/rules/zug.md` — adapt the content from that file rather than duplicating verbatim here.

For the plan, the template content is:

```markdown
# Zug — Always Present

You are always Zug, a learning and thinking companion (havruta in the Jewish tradition).

## Session Start Gate
HARD GATE: When a new session begins:
→ Call `zug_get_context` — non-negotiable, runs in parallel with anything else

## Observation Gate
When something notable happens:
→ If new/contradicting pattern AND confidence medium/high: call `zug_save_observation`

## Session End Gate
Wind-down detected (shorter responses, topic closing, "thanks"):
→ Write one-paragraph summary
→ Call `zug_end_session` with session_id and summary
```

**Note:** The actual content written should be sourced from `~/.claude/rules/zug.md` on the developer's own machine (i.e. the current working rules file), not hardcoded in this plan. See Step 3 below.

- [ ] **Step 1: Write the failing tests**

  Create `src/setup.test.ts`:

  ```typescript
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import fs from "fs";
  import path from "path";
  import os from "os";
  import {
    detectAgents,
    mergeMcpConfig,
    type DetectedAgents,
  } from "./setup.js";

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-setup-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("detectAgents", () => {
    it("detects Claude Code when ~/.claude/ exists", () => {
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir);
      const result = detectAgents({ home: tmpDir });
      expect(result.claudeCode).toBe(true);
    });

    it("does not detect Claude Code when ~/.claude/ absent", () => {
      const result = detectAgents({ home: tmpDir });
      expect(result.claudeCode).toBe(false);
    });

    it("detects Cursor when ~/.cursor/ exists", () => {
      fs.mkdirSync(path.join(tmpDir, ".cursor"));
      const result = detectAgents({ home: tmpDir });
      expect(result.cursor).toBe(true);
    });

    it("detects Windsurf when ~/.codeium/windsurf/ exists", () => {
      fs.mkdirSync(path.join(tmpDir, ".codeium", "windsurf"), { recursive: true });
      const result = detectAgents({ home: tmpDir });
      expect(result.windsurf).toBe(true);
    });

    it("returns all false when nothing is installed", () => {
      const result = detectAgents({ home: tmpDir });
      expect(result).toEqual({ claudeCode: false, cursor: false, windsurf: false });
    });
  });

  describe("mergeMcpConfig", () => {
    it("writes zug entry to a new config file", () => {
      const configPath = path.join(tmpDir, "mcp.json");
      mergeMcpConfig(configPath);
      const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(written.mcpServers.zug.command).toBe("zug-mcp");
    });

    it("merges into an existing config without overwriting other entries", () => {
      const configPath = path.join(tmpDir, "mcp.json");
      fs.writeFileSync(configPath, JSON.stringify({
        mcpServers: { other: { command: "other-tool", args: [] } }
      }, null, 2));
      mergeMcpConfig(configPath);
      const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(written.mcpServers.other.command).toBe("other-tool");
      expect(written.mcpServers.zug.command).toBe("zug-mcp");
    });

    it("is idempotent — running twice doesn't duplicate the entry", () => {
      const configPath = path.join(tmpDir, "mcp.json");
      mergeMcpConfig(configPath);
      mergeMcpConfig(configPath);
      const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(Object.keys(written.mcpServers)).toHaveLength(1);
    });

    it("creates parent directories if they don't exist", () => {
      const configPath = path.join(tmpDir, "nested", "dir", "mcp.json");
      mergeMcpConfig(configPath);
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it("handles malformed JSON by overwriting with a clean config", () => {
      const configPath = path.join(tmpDir, "mcp.json");
      fs.writeFileSync(configPath, "{ invalid json }");
      expect(() => mergeMcpConfig(configPath)).not.toThrow();
      const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(written.mcpServers.zug.command).toBe("zug-mcp");
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `pnpm test -- src/setup.test.ts 2>&1 | tail -10`

  Expected: FAIL — `Cannot find module './setup.js'`.

- [ ] **Step 3: Create `src/setup.ts`**

  Read the current `~/.claude/rules/zug.md` content first:

  ```bash
  cat ~/.claude/rules/zug.md
  ```

  Then create `src/setup.ts`:

  ```typescript
  import fs from "fs";
  import path from "path";
  import os from "os";
  import readline from "readline";

  export interface DetectedAgents {
    claudeCode: boolean;
    cursor: boolean;
    windsurf: boolean;
  }

  export interface SetupOptions {
    claudeCode?: boolean;
    cursor?: boolean;
    windsurf?: boolean;
    all?: boolean;
    yes?: boolean;  // skip confirmation prompt
  }

  const ZUG_MCP_ENTRY = {
    command: "zug-mcp",
    args: [] as string[],
  };

  // Content written to ~/.claude/rules/zug.md — source from the developer's
  // own rules file so it stays in sync with the live rules.
  // Run: cat ~/.claude/rules/zug.md  — then paste the full content here.
  const ZUG_RULES_CONTENT = `# Zug — Always Present

  You are always Zug, a learning and thinking companion (havruta in the Jewish tradition). Zug means "pair" in Hebrew.

  ## Session Start Gate

  HARD GATE: When a new session begins:
  → Call \`zug_get_context\` — non-negotiable, runs in parallel with anything else
  → What do the Active Patterns contain? Identify 2-3 most relevant to the first message
  → Set behavioral frame: challenge intensity, communication style, what to watch for
  → Only then: respond to the user

  ## Observation Gate

  Something notable happens:
  → Does an existing PERSONA pattern explain this, or is this new or contradicting?
  → If new or contradicting AND confidence is medium/high: call \`zug_save_observation\`
  → Include \`context\` if session has a clear domain: "work", "personal", or a project name

  ## Session End Gate

  Wind-down detected (shorter responses, topic closing, "thanks", silence):
  → Is there a summary worth writing?
  → Write one-paragraph summary
  → Call \`zug_end_session\` with session_id, summary, and context (if known)
  `;

  export function detectAgents(opts: { home?: string } = {}): DetectedAgents {
    const home = opts.home ?? os.homedir();
    return {
      claudeCode: fs.existsSync(path.join(home, ".claude")),
      cursor: fs.existsSync(path.join(home, ".cursor")),
      windsurf: fs.existsSync(path.join(home, ".codeium", "windsurf")),
    };
  }

  export function mergeMcpConfig(configPath: string): void {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let config: { mcpServers?: Record<string, unknown> } = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch {
        // malformed — start fresh
      }
    }

    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers["zug"] = ZUG_MCP_ENTRY;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  }

  function writeRulesFile(rulesPath: string): void {
    const dir = path.dirname(rulesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(rulesPath, ZUG_RULES_CONTENT);
  }

  function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  export async function runSetup(opts: SetupOptions, home?: string): Promise<void> {
    const h = home ?? os.homedir();

    // Determine which agents to target
    let targets: DetectedAgents;
    if (opts.all || (opts.claudeCode && opts.cursor && opts.windsurf)) {
      targets = { claudeCode: true, cursor: true, windsurf: true };
    } else if (opts.claudeCode || opts.cursor || opts.windsurf) {
      targets = {
        claudeCode: opts.claudeCode ?? false,
        cursor: opts.cursor ?? false,
        windsurf: opts.windsurf ?? false,
      };
    } else {
      // auto-detect
      targets = detectAgents({ home: h });
    }

    const found = Object.entries(targets)
      .filter(([, v]) => v)
      .map(([k]) => ({ claudeCode: "Claude Code", cursor: "Cursor", windsurf: "Windsurf" }[k] ?? k));

    if (found.length === 0) {
      console.log("[zug] No supported agents detected. Use --claude-code, --cursor, or --windsurf to configure manually.");
      return;
    }

    // Check API key
    const apiKeyEnv = process.env.ANTHROPIC_API_KEY;
    const apiKeyFile = path.join(h, ".zug", ".env");
    const hasApiKey = !!apiKeyEnv || fs.existsSync(apiKeyFile);

    console.log(`Found:  ${found.join(", ")}`);
    console.log(`API key: ${hasApiKey ? "found ✓" : "not found (zug_reasoning_analysis will be unavailable)"}`);

    if (!opts.yes) {
      const answer = await prompt("\nConfigure these? [Y/n] ");
      if (answer.toLowerCase() === "n") {
        console.log("[zug] Aborted.");
        return;
      }
    }

    // Write configs
    if (targets.claudeCode) {
      // Merge ~/.claude.json
      const claudeJson = path.join(h, ".claude.json");
      mergeMcpConfig(claudeJson);
      // Write rules file
      const rulesPath = path.join(h, ".claude", "rules", "zug.md");
      writeRulesFile(rulesPath);
      console.log("✓ Claude Code configured + rules/zug.md written");
    }

    if (targets.cursor) {
      mergeMcpConfig(path.join(h, ".cursor", "mcp.json"));
      console.log("✓ Cursor configured");
    }

    if (targets.windsurf) {
      mergeMcpConfig(path.join(h, ".codeium", "windsurf", "mcp_config.json"));
      console.log("✓ Windsurf configured");
    }

    // Ensure data dir exists
    const zugDir = path.join(h, ".zug");
    if (!fs.existsSync(zugDir)) {
      fs.mkdirSync(zugDir, { recursive: true });
    }
    console.log(`✓ Data dir: ${zugDir} ready`);
    console.log("\nDone. Restart your agents to activate Zug.");
  }
  ```

  **Important:** Before committing, read `~/.claude/rules/zug.md` and replace the placeholder `ZUG_RULES_CONTENT` string with the actual current content of that file. This keeps the distributed rules file in sync with the developer's own.

- [ ] **Step 4: Run tests to verify they pass**

  Run: `pnpm test -- src/setup.test.ts 2>&1 | tail -15`

  Expected: all 9 tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

  Run: `pnpm test 2>&1 | tail -10`

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/setup.ts src/setup.test.ts
  git commit -m "feat: add setup command — agent detection and MCP config writing"
  ```

---

## Task 5: Update `src/cli.ts` — add `setup` and `update` commands

The existing `cli.ts` has `status`, `tail`, `persona`, `compact`, `resume`. Add `setup` and `update`; also extend `status` to show which agents are currently configured and the data directory size.

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Update `cli.ts`**

  At the top of `src/cli.ts`, add the import for `runSetup`:

  ```typescript
  import { runSetup } from "./setup.js";
  ```

  Add these two new command functions after `cmdResume`:

  ```typescript
  async function cmdSetup(args: string[]) {
    const opts = {
      claudeCode: args.includes("--claude-code"),
      cursor: args.includes("--cursor"),
      windsurf: args.includes("--windsurf"),
      all: args.includes("--all"),
      yes: args.includes("--yes") || args.includes("-y"),
    };
    await runSetup(opts);
  }

  function cmdUpdate() {
    const { execSync } = require("child_process") as typeof import("child_process");
    console.log("[zug] Running: npm install -g zug-mcp@latest");
    try {
      execSync("npm install -g zug-mcp@latest", { stdio: "inherit" });
    } catch {
      console.error("[zug] Update failed. Try: npm install -g zug-mcp@latest");
      process.exit(1);
    }
  }
  ```

  Update the `cmdStatus` function to also show agent configuration status:

  ```typescript
  function cmdStatus() {
    const { sessions, observations, personaLines } = getStats();
    const lastDate = getLastSessionDate();
    const excerpt = getPersonaExcerpt(2);
    const trend = getObservationTrend(4);

    // Agent config detection
    const home = os.homedir();
    const claudeConfigured = fs.existsSync(path.join(home, ".claude.json")) &&
      (() => {
        try {
          const cfg = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf-8"));
          return !!cfg?.mcpServers?.zug;
        } catch { return false; }
      })();
    const cursorConfigured = fs.existsSync(path.join(home, ".cursor", "mcp.json")) &&
      (() => {
        try {
          const cfg = JSON.parse(fs.readFileSync(path.join(home, ".cursor", "mcp.json"), "utf-8"));
          return !!cfg?.mcpServers?.zug;
        } catch { return false; }
      })();
    const windsurfConfigured = fs.existsSync(path.join(home, ".codeium", "windsurf", "mcp_config.json")) &&
      (() => {
        try {
          const cfg = JSON.parse(fs.readFileSync(path.join(home, ".codeium", "windsurf", "mcp_config.json"), "utf-8"));
          return !!cfg?.mcpServers?.zug;
        } catch { return false; }
      })();

    // Data dir size
    let dirSize = "?";
    try {
      const zugDir = path.join(home, ".zug");
      if (fs.existsSync(zugDir)) {
        const { execSync } = require("child_process") as typeof import("child_process");
        dirSize = execSync(`du -sh "${zugDir}" 2>/dev/null | cut -f1`, { encoding: "utf-8" }).trim();
      }
    } catch { /* best effort */ }

    const agentLines = [
      `  Claude Code: ${claudeConfigured ? "✓" : "not configured"}`,
      `  Cursor:      ${cursorConfigured ? "✓" : "not configured"}`,
      `  Windsurf:    ${windsurfConfigured ? "✓" : "not configured"}`,
    ];

    const lines = [
      "## Zug Status",
      "",
      "### Agents",
      ...agentLines,
      "",
      "### Data",
      `Sessions: ${sessions}${lastDate ? ` | Last: ${lastDate}` : ""}`,
      `Observations: ${observations}`,
      `Persona lines: ${personaLines}`,
      `Data dir size: ${dirSize}`,
      excerpt ? `Excerpt: ${excerpt}` : null,
      `Trend (obs/week, last 4): ${trend.join(" → ")}`,
    ].filter(Boolean);

    console.log(lines.join("\n"));
  }
  ```

  Update the switch statement to add the new cases and update help:

  ```typescript
  switch (cmd) {
    case "setup":
      cmdSetup(rest).catch((e) => {
        console.error("[zug] Setup failed:", e.message);
        process.exit(1);
      });
      break;
    case "update":
      cmdUpdate();
      break;
    case "status":
      cmdStatus();
      break;
    case "tail":
      cmdTail(rest[0]);
      break;
    case "persona":
      cmdPersona();
      break;
    case "compact":
      cmdCompact();
      break;
    case "resume":
      cmdResume();
      break;
    case "--version":
    case "version":
      console.log("1.0.0");
      break;
    default:
      printUsage();
  }
  ```

  Update `printUsage`:

  ```typescript
  function printUsage() {
    console.error(`Usage: zug <command>
    zug setup [--claude-code] [--cursor] [--windsurf] [--all] [-y]
                        Detect and configure agents. Auto-detects if no flags given.
    zug update          Run npm install -g zug-mcp@latest
    zug status          Show agents configured, sessions, observations, data dir size
    zug tail [n]        Show recent observations (default: 10)
    zug persona         Print full PERSONA.md
    zug compact         Print pre-compaction checkpoint (used by PreCompact hook)`);
    process.exit(1);
  }
  ```

- [ ] **Step 2: Run typecheck**

  Run: `pnpm typecheck 2>&1 | tail -20`

  Expected: no errors. Fix any TypeScript errors before proceeding.

- [ ] **Step 3: Smoke-test the new status output**

  Run: `pnpm cli status`

  Expected: output includes `## Zug Status`, `### Agents`, `### Data` sections.

- [ ] **Step 4: Commit**

  ```bash
  git add src/cli.ts
  git commit -m "feat: add setup and update commands to CLI; extend status with agent config"
  ```

---

## Task 6: Rewrite `README.md`

The current README describes Zug as a personal Claude tool. The public README needs to reflect the OSS positioning.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite `README.md`**

  The content should be:

  ```markdown
  # ⚡ zug

  **The memory and reflection layer for people who work with AI.**

  *Observations. Patterns. Lessons. Growth — across every session, every agent.*

  Works with **Claude Code** · **Cursor** · **Windsurf** · any MCP-compatible agent

  ```bash
  npm install -g zug-mcp && zug setup
  ```

  ---

  ## What it does

  AI agents are amnesiac by default — each session starts from zero. Zug gives them persistent memory: a cognitive fingerprint that grows with every conversation.

  - **Observations** — patterns and insights saved mid-session
  - **Lessons** — named, trackable learnings that carry across sessions
  - **Persona** — your cognitive fingerprint, updated after every session
  - **Growth** — trends across sessions: observation rate, reinforced patterns, persona growth

  ---

  ## Install

  ```bash
  npm install -g zug-mcp
  zug setup
  ```

  `zug setup` auto-detects Claude Code, Cursor, and Windsurf. It writes MCP config files and — for Claude Code — a behavioral rules file that makes Zug fully autonomous.

  **Explicit mode** (scriptable, idempotent):

  ```bash
  zug setup --claude-code     # Claude Code only
  zug setup --cursor          # Cursor only
  zug setup --windsurf        # Windsurf only
  zug setup --all             # All detected agents
  ```

  ---

  ## Agent support

  | Agent | MCP config | Autonomous rules | Autonomy tier |
  |-------|-----------|-----------------|---------------|
  | Claude Code | ✓ `~/.claude.json` | ✓ `~/.claude/rules/zug.md` | Full — Zug calls tools without user prompting |
  | Cursor | ✓ `~/.cursor/mcp.json` | — | Best-effort — guided by MCP server instructions |
  | Windsurf | ✓ `~/.codeium/windsurf/mcp_config.json` | — | Best-effort — guided by MCP server instructions |
  | Any MCP client | Manual config | — | Depends on MCP spec compliance |

  Claude Code is the first-class experience. Cursor and Windsurf receive the tools and behavioral guidance via the MCP server's `instructions` field; how well they follow it depends on the client.

  ---

  ## CLI

  ```bash
  zug status          # Configured agents, sessions, observations, data dir size
  zug update          # Update to latest: npm install -g zug-mcp@latest
  zug tail [n]        # Recent observations (default: 10)
  zug persona         # Print full PERSONA.md
  ```

  ---

  ## Tools (16, all free)

  **Memory:** `zug_get_context` · `zug_save_observation` · `zug_end_session` · `zug_get_recent_sessions` · `zug_status`

  **Learning:** `zug_create_lesson` · `zug_lesson_digest` · `zug_lesson_update` · `zug_reinforce_lesson` · `zug_open_thread` · `zug_close_thread` · `zug_get_open_thread` · `zug_growth_summary`

  **Patterns:** `zug_reinforce_pattern` · `zug_get_top_patterns`

  **Analysis:** `zug_reasoning_analysis` *(requires `ANTHROPIC_API_KEY`)*

  ---

  ## Data

  All data lives at `~/.zug/` on your machine. Nothing is sent anywhere.

  ```
  ~/.zug/
  ├── PERSONA.md         ← your cognitive fingerprint
  ├── PLAYBOOK.md        ← what works for you
  ├── ACTIVE.md          ← active patterns for the next session
  ├── observations.jsonl ← structured observation log
  ├── sessions/          ← full session logs by date
  ├── lessons.json       ← named lessons
  └── growth.jsonl       ← per-session growth snapshots
  ```

  ---

  ## License

  MIT — see [LICENSE](./LICENSE).

  ---

  ## Contributing

  See [CONTRIBUTING.md](./CONTRIBUTING.md).
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add README.md
  git commit -m "docs: rewrite README as public-facing OSS landing page"
  ```

---

## Task 7: `CONTRIBUTING.md`

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Create `CONTRIBUTING.md`**

  ```markdown
  # Contributing to zug-mcp

  ## Setup

  ```bash
  git clone https://github.com/YOUR_ORG/zug-mcp
  cd zug-mcp
  pnpm install
  ```

  ## Development

  Run the MCP server in dev mode (stdio transport, connects to Claude Code directly):

  ```bash
  pnpm dev
  ```

  Run the CLI:

  ```bash
  pnpm cli status
  pnpm cli setup --claude-code -y   # auto-setup Claude Code without prompts
  ```

  ## Tests

  ```bash
  pnpm test           # run all tests once
  pnpm test:watch     # watch mode
  pnpm typecheck      # TypeScript check without emitting
  ```

  Tests use [Vitest](https://vitest.dev/). Test files live next to source (`src/*.test.ts`).

  ## Build

  ```bash
  pnpm build          # compiles TypeScript → dist/
  ```

  The published package ships only `dist/` — the TypeScript source is not included in the npm tarball.

  ## Pull requests

  - Keep PRs focused: one feature or fix per PR
  - Tests required for new behavior
  - Run `pnpm typecheck && pnpm test` before opening a PR
  - Describe the *why* in the PR description, not the *what*

  ## Data format

  User data lives at `~/.zug/`. See `src/storage.ts` for the complete schema. JSONL files append on write; never truncate or overwrite existing lines.

  ## Project structure

  ```
  src/
  ├── server.ts       ← MCP tools (all 16 tools defined here)
  ├── storage.ts      ← data layer (read/write ~/.zug/ files)
  ├── setup.ts        ← zug setup command logic
  ├── cli.ts          ← CLI entry point
  ├── stdio.ts        ← MCP server entry point (stdio transport)
  ├── synthesize.ts   ← end-of-session synthesis (AI-driven persona update)
  └── api-key.ts      ← Anthropic API key loading
  ```
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add CONTRIBUTING.md
  git commit -m "docs: add CONTRIBUTING.md with dev setup guide"
  ```

---

## Task 8: End-to-end smoke test

Verify the full install flow works as a real user would experience it.

**Files:** none — manual validation

- [ ] **Step 1: Build the package**

  Run: `pnpm build`

  Expected: `dist/cli.js` and `dist/stdio.js` are created. No TypeScript errors.

- [ ] **Step 2: Verify binaries are executable**

  Run:
  ```bash
  node dist/cli.js --version
  node dist/cli.js status
  node dist/stdio.js --help 2>&1 || echo "(stdio server starts, no --help expected)"
  ```

  Expected: `--version` prints `1.0.0`. `status` prints agent/data info without crashing.

- [ ] **Step 3: Test setup in dry-run mode**

  Run a setup with explicit flag and `-y` against a temp directory to avoid touching real config:

  ```bash
  HOME=/tmp/zug-smoke-test node dist/cli.js setup --claude-code -y
  ls /tmp/zug-smoke-test/.claude.json
  cat /tmp/zug-smoke-test/.claude.json
  cat /tmp/zug-smoke-test/.claude/rules/zug.md
  ```

  Expected:
  - `~/.claude.json` contains `{ "mcpServers": { "zug": { "command": "zug-mcp", "args": [] } } }`
  - `~/.claude/rules/zug.md` contains the rules content

- [ ] **Step 4: Verify idempotent — run setup twice**

  Run:
  ```bash
  HOME=/tmp/zug-smoke-test node dist/cli.js setup --claude-code -y
  HOME=/tmp/zug-smoke-test node dist/cli.js setup --claude-code -y
  cat /tmp/zug-smoke-test/.claude.json
  ```

  Expected: `mcpServers` still has exactly one `zug` entry. No duplicates.

- [ ] **Step 5: Clean up temp dir**

  Run: `rm -rf /tmp/zug-smoke-test`

- [ ] **Step 6: Run full test suite one final time**

  Run: `pnpm test 2>&1 | tail -15`

  Expected: all tests pass.

- [ ] **Step 7: Final commit**

  ```bash
  git add -A
  git status  # verify only expected files staged
  git commit -m "feat: zug OSS distribution — npm package, setup command, instructions field, README, LICENSE"
  ```

---

## Spec Coverage Check

| Spec requirement | Task that implements it |
|-----------------|------------------------|
| `npm install -g zug-mcp` — two binaries | Task 1: package.json `bin` entries |
| `zug setup` auto-detect + confirm | Task 4: `runSetup()` in setup.ts |
| `--claude-code --cursor --windsurf --all` flags | Task 4: `SetupOptions` flags |
| Never overwrites existing config — merges only | Task 4: `mergeMcpConfig()` |
| Idempotent | Task 4: `mergeMcpConfig()` |
| Writes `~/.claude/rules/zug.md` | Task 4: `writeRulesFile()` |
| Claude Code: `~/.claude.json` MCP entry | Task 4 |
| Cursor: `~/.cursor/mcp.json` | Task 4 |
| Windsurf: `~/.codeium/windsurf/mcp_config.json` | Task 4 |
| Two-tier autonomy: rules file (CC) + instructions (others) | Tasks 3 + 4 |
| `zug status` with agent config + data dir size | Task 5 |
| `zug update` | Task 5 |
| MIT license | Task 2 |
| Public README with positioning headline | Task 6 |
| CONTRIBUTING.md | Task 7 |
| `files` field — only ship dist/ | Task 1 |
| `engines: node >= 20` | Task 1 |
| API key optional — tools degrade gracefully | Already implemented in server.ts |
| All 16 tools ship, no gating | Already in server.ts |
| `zug setup --cloud [token]` | **Deferred — Phase 2** |
