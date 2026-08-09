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
import { checkForUpdate, updateNoticeLine } from "./version-check.js";

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

async function cmdResume(): Promise<void> {
  if (getSyncMode() === "synced") {
    await runPull({ timeoutMs: 3000 }).catch(() => {});
  }

  const { sessions, observations } = getStats();
  const lastDate = getLastSessionDate();
  const active = readActive();

  if (sessions === 0 && !active) {
    const lines = ["# Zug — context resumed (no data yet)"];
    const latestVersion = await checkForUpdate(version);
    if (latestVersion) lines.push("", updateNoticeLine(version, latestVersion));
    console.log(lines.join("\n"));
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

  const latestVersion = await checkForUpdate(version);
  if (latestVersion) parts.push("", updateNoticeLine(version, latestVersion));

  console.log(parts.join("\n"));
}

async function cmdCompact(): Promise<void> {
  // PreCompact hook entrypoint. Its only job is durability: flush local changes to the
  // canonical server before Claude Code compacts context. PreCompact stdout is NOT
  // injected into the model (only SessionStart stdout is — post-compaction reload is
  // handled by `zug resume` via the SessionStart:compact hook). So this command
  // deliberately prints no "checkpoint": doing so would imply a context injection that
  // never happens (ISS-042). Output below is a terse, honest side-effect log only.
  if (getSyncMode() !== "synced") {
    console.log("zug compact: local-only mode — nothing to push (data already on disk).");
    return;
  }

  const result = await runPush().catch((err: unknown) => ({
    status: "paused" as const,
    error: err instanceof Error ? err.message : String(err),
  }));
  console.log(`zug compact: durability push → ${JSON.stringify(result)}`);
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
  const lines: string[] = [];
  if (getSyncMode() === "local-only") {
    lines.push("Sync is not configured (local-only mode). Set ZUG_URL and ZUG_TOKEN in ~/.zug/config to enable.");
  } else {
    const fn = kind === "pull" ? runPull : kind === "push" ? runPush : runSync;
    const result = await fn();
    lines.push(`zug ${kind}: ${JSON.stringify(result)}`);
  }

  // `zug pull` backs the SessionStart:startup hook — the one channel that reaches every
  // user, including local-only, so the update check runs here regardless of sync mode.
  if (kind === "pull") {
    const latestVersion = await checkForUpdate(version);
    if (latestVersion) lines.push(updateNoticeLine(version, latestVersion));
  }

  console.log(lines.join("\n"));
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
  zug compact         Durability push before context compaction (used by PreCompact hook)
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

// Commands that already surface the update check themselves (pull/resume, via the
// SessionStart-injected stdout channel) or where it would be noise (update itself,
// version, unrecognized commands) are excluded from the generic stderr notifier below.
const SKIP_UPDATE_NOTIFIER = new Set(["pull", "resume", "update", "version", "--version", undefined]);

async function main(): Promise<void> {
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
      await cmdCompact();
      break;
    case "resume":
      await cmdResume();
      break;
    case "setup":
      await cmdSetup(rest);
      break;
    case "update":
      await cmdUpdate();
      break;
    case "archive":
      cmdArchive();
      break;
    case "backup":
      cmdBackup();
      break;
    case "sync":
      await cmdSync("sync");
      break;
    case "pull":
      await cmdSync("pull");
      break;
    case "push":
      await cmdSync("push");
      break;
    case "--version":
    case "version":
      console.log(version);
      break;
    default:
      printUsage();
  }

  if (!SKIP_UPDATE_NOTIFIER.has(cmd)) {
    const latestVersion = await checkForUpdate(version);
    if (latestVersion) console.error(updateNoticeLine(version, latestVersion));
  }

  process.exit(0);
}

main();
