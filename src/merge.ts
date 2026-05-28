#!/usr/bin/env npx tsx
import fs from "fs";
import path from "path";
import os from "os";
import { synthesize } from "./synthesize.js";
import { writeActive } from "./storage.js";
import { mergeObservations } from "./merge-core.js";

const ZUG_DIR = path.join(os.homedir(), ".zug");

function usage() {
  console.log(`Usage: npx tsx src/merge.ts <path-to-external-zug-dir>

Example:
  npx tsx src/merge.ts ~/Desktop/zug-export
  npx tsx src/merge.ts /Volumes/USB/zug-backup

The external directory should contain some or all of:
  PERSONA.md, PLAYBOOK.md, observations.jsonl, sessions/
`);
  process.exit(1);
}

async function main() {
  const importDir = process.argv[2];
  if (!importDir || !fs.existsSync(importDir)) {
    if (importDir) console.error(`Not found: ${importDir}`);
    usage();
  }

  const abs = path.resolve(importDir);
  console.log(`Merging from: ${abs}`);
  console.log(`Into:         ${ZUG_DIR}\n`);

  // ── 1. Merge observations.jsonl ──────────────────────────────────────────
  const localObsFile = path.join(ZUG_DIR, "observations.jsonl");
  const importObsFile = path.join(abs, "observations.jsonl");

  if (fs.existsSync(importObsFile)) {
    const parseObs = (lines: string[]) =>
      lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    const localLines = fs.existsSync(localObsFile)
      ? fs.readFileSync(localObsFile, "utf-8").split("\n").filter(Boolean)
      : [];
    const importLines = fs.readFileSync(importObsFile, "utf-8").split("\n").filter(Boolean);

    const baseObs = parseObs(localLines);
    const incomingObs = parseObs(importLines);
    const merged = mergeObservations(baseObs, incomingObs);
    const added = Math.max(0, merged.length - baseObs.length);

    fs.writeFileSync(localObsFile, merged.map((o) => JSON.stringify(o)).join("\n") + "\n", "utf-8");
    console.log(`observations.jsonl: ${added} new observations merged (${merged.length} total)`);
  } else {
    console.log("observations.jsonl: not found in import, skipped");
  }

  // ── 2. Merge sessions/ ──────────────────────────────────────────────────
  const localSessionsDir = path.join(ZUG_DIR, "sessions");
  const importSessionsDir = path.join(abs, "sessions");

  if (fs.existsSync(importSessionsDir)) {
    fs.mkdirSync(localSessionsDir, { recursive: true });
    const importFiles = fs.readdirSync(importSessionsDir).filter((f) => f.endsWith(".md"));
    const localFiles = new Set(fs.readdirSync(localSessionsDir));

    let copied = 0;
    for (const file of importFiles) {
      if (!localFiles.has(file)) {
        fs.copyFileSync(path.join(importSessionsDir, file), path.join(localSessionsDir, file));
        copied++;
      }
    }
    console.log(`sessions/: ${copied} new session files copied (${importFiles.length - copied} already existed)`);
  } else {
    console.log("sessions/: not found in import, skipped");
  }

  // ── 3. Synthesize PERSONA.md + PLAYBOOK.md ──────────────────────────────
  const localPersona = fs.existsSync(path.join(ZUG_DIR, "PERSONA.md"))
    ? fs.readFileSync(path.join(ZUG_DIR, "PERSONA.md"), "utf-8")
    : "";
  const importPersona = fs.existsSync(path.join(abs, "PERSONA.md"))
    ? fs.readFileSync(path.join(abs, "PERSONA.md"), "utf-8")
    : "";

  const localPlaybook = fs.existsSync(path.join(ZUG_DIR, "PLAYBOOK.md"))
    ? fs.readFileSync(path.join(ZUG_DIR, "PLAYBOOK.md"), "utf-8")
    : "";
  const importPlaybook = fs.existsSync(path.join(abs, "PLAYBOOK.md"))
    ? fs.readFileSync(path.join(abs, "PLAYBOOK.md"), "utf-8")
    : "";

  if (!importPersona && !importPlaybook) {
    console.log("\nPERSONA.md / PLAYBOOK.md: not found in import, skipped");
    console.log("\nDone.");
    return;
  }

  console.log("\nSynthesizing PERSONA.md and PLAYBOOK.md with Haiku...");

  const result = await synthesize({
    currentPersona: localPersona,
    currentPlaybook: localPlaybook,
    sessionSummary: `Merging data from a second environment. The imported PERSONA.md and PLAYBOOK.md represent observations from a different machine but the same person.\n\n## Imported PERSONA.md\n${importPersona}\n\n## Imported PLAYBOOK.md\n${importPlaybook}`,
    observations: [],
  });

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
    if (result.active) writeActive(result.active);
    console.log("PERSONA.md: synthesized (backup saved)");
    console.log("PLAYBOOK.md: synthesized (backup saved)");
    console.log("ACTIVE.md: updated");
  } else {
    console.error("Synthesis failed — is ANTHROPIC_API_KEY set in ~/.zug/.env or environment?");
    console.log("PERSONA.md and PLAYBOOK.md were NOT modified.");
    console.log("Observations and sessions were still merged.");
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
