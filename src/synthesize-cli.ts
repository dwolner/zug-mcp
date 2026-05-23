#!/usr/bin/env tsx
/**
 * Manual synthesis CLI
 * Usage:
 *   pnpm tsx src/synthesize-cli.ts               # synthesize all unseen observations
 *   pnpm tsx src/synthesize-cli.ts --dry-run      # print what would change, don't write
 *   pnpm tsx src/synthesize-cli.ts --session <id> # limit to a specific session's observations
 */

import fs from "fs";
import path from "path";
import os from "os";
import { readPersona, readPlaybook, writePersona, writePlaybook, writeActive } from "./storage.js";
import { synthesize } from "./synthesize.js";

const ZUG_DIR = process.env.ZUG_DATA_DIR || path.join(os.homedir(), ".zug");
const OBSERVATIONS_FILE = path.join(ZUG_DIR, "observations.jsonl");

function readAllObservations() {
  if (!fs.existsSync(OBSERVATIONS_FILE)) return [];
  return fs
    .readFileSync(OBSERVATIONS_FILE, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sessionIdx = args.indexOf("--session");
  const sessionFilter = sessionIdx !== -1 ? args[sessionIdx + 1] : null;

  const allObs = readAllObservations();
  const filtered = sessionFilter
    ? allObs.filter((o: any) => o.session_id === sessionFilter)
    : allObs;
  const meaningful = filtered.filter((o: any) => o.confidence !== "low");

  console.log(`Observations: ${allObs.length} total, ${filtered.length} in scope, ${meaningful.length} meaningful (non-low confidence)`);
  if (sessionFilter) console.log(`Session filter: ${sessionFilter}`);

  if (meaningful.length === 0) {
    console.log("Nothing to synthesize.");
    process.exit(0);
  }

  const persona = readPersona();
  const playbook = readPlaybook();

  console.log(`Persona: ${persona.split("\n").length} lines`);
  console.log(`Playbook: ${playbook.split("\n").length} lines`);
  console.log("Running synthesis via Haiku...");

  const summary = sessionFilter
    ? `Manual synthesis for session: ${sessionFilter}`
    : `Manual synthesis across ${meaningful.length} observations from ${new Set(meaningful.map((o: any) => o.session_id)).size} sessions`;

  const result = await synthesize({
    currentPersona: persona,
    currentPlaybook: playbook,
    sessionSummary: summary,
    observations: meaningful.map((o: any) => ({
      type: o.type,
      observation: o.observation,
      confidence: o.confidence,
    })),
  });

  if (!result) {
    const hasKey = !!process.env.ANTHROPIC_API_KEY || fs.existsSync(path.join(ZUG_DIR, ".env"));
    if (!hasKey) console.error("Synthesis failed — check ANTHROPIC_API_KEY in ~/.zug/.env");
    else console.log("Nothing to write.");
    process.exit(0);
  }

  if (dryRun) {
    console.log("\n--- DRY RUN: PERSONA (would write) ---");
    console.log(result.persona);
    console.log("\n--- DRY RUN: PLAYBOOK (would write) ---");
    console.log(result.playbook);
    if (result.active) {
      console.log("\n--- DRY RUN: ACTIVE (would write) ---");
      console.log(result.active);
    }
    console.log("\nDry run complete. No files written.");
  } else {
    writePersona(result.persona);
    writePlaybook(result.playbook);
    if (result.active) writeActive(result.active);
    console.log("Done. PERSONA.md, PLAYBOOK.md, and ACTIVE.md updated.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
