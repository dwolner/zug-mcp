/**
 * Regenerates the Agent Support table in README.md from web/app/clients.ts.
 *
 * The table and the landing page spec block used to be maintained by hand and
 * drifted: the README listed three clients as tiers while the page listed them
 * as equals, and neither mentioned that hooks are Claude Code only. One source
 * now feeds both.
 *
 *   npm run sync:readme          rewrite the table
 *   npm run sync:readme -- --check   fail if it is out of date (for CI)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clients, hookedClients, type AgentClient } from "../web/app/clients.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const README = path.join(HERE, "..", "README.md");
const START = "<!-- clients:start -->";
const END = "<!-- clients:end -->";

const STATUS_LABEL: Record<AgentClient["status"], string> = {
  supported: "`zug setup`",
  manual: "Manual config",
  planned: "Planned",
};

function cell(v: string | null): string {
  return v ? `\`${v}\`` : "—";
}

function render(): string {
  const rows = clients
    .map(
      (c) =>
        `| **${c.name}** | ${STATUS_LABEL[c.status]} | ${cell(c.mcp)} | ${cell(c.hooks)} | ${cell(c.rules)} | ${c.note ?? ""} |`
    )
    .join("\n");

  const hooked = hookedClients.map((c) => c.name).join(", ");

  return [
    START,
    "",
    "<!-- Generated from web/app/clients.ts by scripts/sync-readme-clients.ts. Do not edit by hand. -->",
    "",
    "| Client | Configured by | MCP config | Hooks | Rules file | Notes |",
    "|---|---|---|---|---|---|",
    rows,
    "",
    `**What hooks buy you.** A hook is code your harness runs whether the model cooperates or not, so the persona is loaded and synced without the agent choosing to do it. Today that is ${hooked}.`,
    "",
    "**What no client guarantees.** Capture is always a `zug_save_observation` tool call, prompted by a rules file at best. No hook writes observations; they only pull, push and checkpoint. So how much gets captured depends on the harness and the model, not on this table.",
    "",
    "Zug is model-agnostic. It attaches to the harness, so any MCP client works regardless of which model is behind it.",
    "",
    END,
  ].join("\n");
}

const readme = fs.readFileSync(README, "utf-8");
const a = readme.indexOf(START);
const b = readme.indexOf(END);
if (a === -1 || b === -1) {
  console.error(`Missing ${START} / ${END} markers in README.md`);
  process.exit(1);
}

const next = readme.slice(0, a) + render() + readme.slice(b + END.length);

if (process.argv.includes("--check")) {
  if (next !== readme) {
    console.error("README client table is out of date. Run: npm run sync:readme");
    process.exit(1);
  }
  console.log("README client table is up to date.");
} else {
  fs.writeFileSync(README, next, "utf-8");
  console.log(`Wrote ${clients.length} clients into README.md`);
}
