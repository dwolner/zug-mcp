#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import os from "os";
import {
  getStats,
  getLastSessionDate,
  getPersonaExcerpt,
  getObservationTrend,
  readPersona,
  readActive,
} from "./storage.js";

const ZUG_DIR = process.env.ZUG_DATA_DIR || path.join(os.homedir(), ".zug");
const OBSERVATIONS_FILE = path.join(ZUG_DIR, "observations.jsonl");

function cmdStatus() {
  const { sessions, observations, personaLines } = getStats();
  const lastDate = getLastSessionDate();
  const excerpt = getPersonaExcerpt(2);
  const trend = getObservationTrend(4);

  const lines = [
    `Sessions: ${sessions}${lastDate ? ` | Last: ${lastDate}` : ""}`,
    `Observations: ${observations}`,
    `Persona lines: ${personaLines}`,
    excerpt ? `Excerpt: ${excerpt}` : null,
    `Trend (obs/week, last 4): ${trend.join(" → ")}`,
  ].filter(Boolean);

  console.log(lines.join("\n"));
}

function cmdTail(limitArg?: string) {
  const limit = limitArg ? Math.max(1, parseInt(limitArg, 10) || 10) : 10;

  if (!fs.existsSync(OBSERVATIONS_FILE)) {
    console.log("No observations yet.");
    return;
  }

  const lines = fs.readFileSync(OBSERVATIONS_FILE, "utf-8")
    .split("\n")
    .filter(Boolean)
    .reverse()
    .slice(0, limit);

  if (lines.length === 0) {
    console.log("No observations yet.");
    return;
  }

  for (const line of lines) {
    try {
      const obs = JSON.parse(line) as {
        type: string;
        confidence: string;
        observation: string;
        timestamp: string;
      };
      const date = obs.timestamp.slice(0, 10);
      console.log(`[${obs.type}/${obs.confidence}] ${obs.observation} — ${date}`);
    } catch {
      // skip malformed lines
    }
  }
}

function cmdPersona() {
  const content = readPersona();
  if (!content) {
    console.log("No PERSONA.md found. Run 'pnpm onboard' to create one.");
    return;
  }
  console.log(content);
}

function cmdCompact() {
  const { sessions, observations } = getStats();
  const lastDate = getLastSessionDate();
  const active = readActive();

  if (sessions === 0 && !active) {
    console.log("# Zug — no data yet");
    return;
  }

  const parts: string[] = ["# Zug Checkpoint (pre-compact)", ""];

  const statLine = `Sessions: ${sessions}${lastDate ? ` | Last: ${lastDate}` : ""} | Observations: ${observations}`;
  parts.push(statLine, "");

  if (active) {
    parts.push("## Active Patterns", "", active, "");
  }

  parts.push(
    "## Note",
    "Observations are persisted to observations.jsonl. Call zug_get_context at the start of the next turn to reload full context.",
  );

  console.log(parts.join("\n"));
}

function printUsage() {
  console.error(`Usage: zug <command>
  zug status          Show sessions, observations, persona size, and trend
  zug tail [n]        Show recent observations (default: 10)
  zug persona         Print full PERSONA.md
  zug compact         Print pre-compaction checkpoint (used by PreCompact hook)`);
  process.exit(1);
}

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
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
  case "--version":
  case "version":
    console.log("1.0.0");
    break;
  default:
    printUsage();
}
