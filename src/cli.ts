#!/usr/bin/env node
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")) as { version: string };
import {
  getStats,
  getLastSessionDate,
  getPersonaExcerpt,
  getObservationTrend,
  readPersona,
  readActive,
  getDataDir,
  archiveSessions,
} from "./storage.js";
import { runSetup } from "./setup.js";
import { sync as runSync, pull as runPull, push as runPush } from "./sync.js";
import { getSyncMode } from "./sync-state.js";

const ZUG_DIR = getDataDir();
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
  ].filter(Boolean) as string[];

  const home = os.homedir();
  const agentConfigs = [
    { name: "Claude Code", path: path.join(home, ".claude.json") },
    { name: "Cursor",      path: path.join(home, ".cursor", "mcp.json") },
    { name: "Windsurf",    path: path.join(home, ".codeium", "windsurf", "mcp_config.json") },
  ];
  for (const agent of agentConfigs) {
    let configured = false;
    try {
      const raw = fs.readFileSync(agent.path, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      configured = !!(parsed.mcpServers && (parsed.mcpServers as Record<string, unknown>).zug);
    } catch { /* file missing or malformed */ }
    lines.push(`${agent.name}: ${configured ? "configured" : "not configured"}`);
  }

  try {
    const size = execSync(`du -sh "${ZUG_DIR}" 2>/dev/null`, { encoding: "utf-8" }).trim().split(/\s/)[0];
    lines.push(`Data dir size: ${size}`);
  } catch { /* du not available */ }

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

function cmdResume() {
  const { sessions, observations } = getStats();
  const lastDate = getLastSessionDate();
  const active = readActive();

  if (sessions === 0 && !active) {
    console.log("# Zug — context resumed (no data yet)");
    return;
  }

  const parts: string[] = ["# Zug — Context Resumed", ""];
  parts.push("Your session context was compacted. Your Zug data is intact on disk.", "");

  const statLine = `Sessions: ${sessions}${lastDate ? ` | Last: ${lastDate}` : ""} | Observations: ${observations}`;
  parts.push(statLine, "");

  if (active) {
    parts.push("## Active Patterns", "", active, "");
  }

  parts.push(
    "## Action required",
    "Call zug_get_context now to reload your full cognitive fingerprint and playbook.",
  );

  console.log(parts.join("\n"));
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

async function cmdSetup(args: string[]): Promise<void> {
  const all = args.includes("--all");
  const opts: Parameters<typeof runSetup>[0] = {};
  if (all || args.includes("--claude-code")) opts!.claude = true;
  if (all || args.includes("--cursor")) opts!.cursor = true;
  if (all || args.includes("--windsurf")) opts!.windsurf = true;
  try {
    await runSetup(Object.keys(opts!).length > 0 ? opts : undefined);
  } catch (err) {
    console.error("Setup failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function cmdUpdate(): Promise<void> {
  console.log("Updating zug-mcp to latest...");
  try {
    execSync("npm install -g zug-mcp@latest", { stdio: "inherit" });
    console.log("Update complete.");
    await runSetup({ claude: true, quiet: true });
  } catch {
    console.error("Update failed. Try: npm install -g zug-mcp@latest");
    process.exit(1);
  }
}

function cmdBackup(): void {
  const configPath = path.join(os.homedir(), ".zug", "config");

  // Parse ZUG_URL from ~/.zug/config
  let zugUrl: string | undefined;
  if (fs.existsSync(configPath)) {
    for (const line of fs.readFileSync(configPath, "utf-8").split("\n")) {
      const m = line.match(/^ZUG_URL=(.+)$/);
      if (m) zugUrl = m[1].trim();
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const backupDir = path.join(os.homedir(), ".zug-backup", date);
  fs.mkdirSync(backupDir, { recursive: true });

  if (zugUrl) {
    // Extract app name from https://<app>.fly.dev
    const appMatch = zugUrl.match(/https?:\/\/([^.]+)\.fly\.dev/);
    const app = appMatch ? appMatch[1] : "zug-mcp";
    console.log(`Backing up Fly volume (${app}) → ${backupDir}`);
    try {
      execSync(`fly sftp get -a "${app}" -R /data/.zug "${backupDir}"`, { stdio: "inherit" });
      console.log(`Backup complete: ${backupDir}`);
    } catch {
      console.error("Backup failed. Make sure flyctl is installed and you are logged in.");
      process.exit(1);
    }
  } else {
    // No Fly config — back up local data dir
    console.log(`No Fly config found. Backing up local ${ZUG_DIR} → ${backupDir}`);
    execSync(`cp -r "${ZUG_DIR}/." "${backupDir}"`, { stdio: "inherit" });
    console.log(`Backup complete: ${backupDir}`);
  }
}

async function cmdSync(kind: "sync" | "pull" | "push"): Promise<void> {
  if (getSyncMode() === "local-only") {
    console.log("Sync is not configured (local-only mode). Set ZUG_URL and ZUG_TOKEN in ~/.zug/config to enable.");
    return;
  }
  const fn = kind === "pull" ? runPull : kind === "push" ? runPush : runSync;
  const result = await fn();
  console.log(`zug ${kind}: ${JSON.stringify(result)}`);
}

function cmdArchive(): void {
  const { archived } = archiveSessions();
  const archiveDir = path.join(ZUG_DIR, "sessions", "archive");
  if (archived === 0) {
    console.log("No sessions older than 90 days to archive.");
  } else {
    console.log(`Archived ${archived} session${archived > 1 ? "s" : ""} to ${archiveDir}`);
  }
}

function printUsage() {
  console.error(`Usage: zug <command>
  zug status          Show sessions, observations, config status, and data dir size
  zug tail [n]        Show recent observations (default: 10)
  zug persona         Print full PERSONA.md
  zug compact         Print pre-compaction checkpoint (used by PreCompact hook)
  zug archive         Move sessions older than 90 days to sessions/archive/
  zug setup           Auto-detect agents and write MCP configs
    --claude-code     Configure Claude Code only
    --cursor          Configure Cursor only
    --windsurf        Configure Windsurf only
    --all             Configure all agents
  zug update          Update zug-mcp to latest (runs npm install -g)
  zug backup          Snapshot Fly volume (or local data) to ~/.zug-backup/YYYY-MM-DD/
  zug sync            Push local changes then pull canonical state (if sync configured)
  zug pull            Pull canonical state from the server
  zug push            Push local changes to the server`);
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
  case "resume":
    cmdResume();
    break;
  case "setup":
    cmdSetup(rest).then(() => process.exit(0));
    break;
  case "update":
    cmdUpdate().then(() => process.exit(0));
    break;
  case "archive":
    cmdArchive();
    break;
  case "backup":
    cmdBackup();
    break;
  case "sync": cmdSync("sync").then(() => process.exit(0)); break;
  case "pull": cmdSync("pull").then(() => process.exit(0)); break;
  case "push": cmdSync("push").then(() => process.exit(0)); break;
  case "--version":
  case "version":
    console.log(version);
    break;
  default:
    printUsage();
}
