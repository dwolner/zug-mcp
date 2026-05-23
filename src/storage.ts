import fs from "fs";
import path from "path";
import os from "os";

function getPaths() {
  const zugDir = process.env.ZUG_DATA_DIR || path.join(os.homedir(), ".zug");
  return {
    zugDir,
    sessionsDir: path.join(zugDir, "sessions"),
    personaFile: path.join(zugDir, "PERSONA.md"),
    playbookFile: path.join(zugDir, "PLAYBOOK.md"),
    observationsFile: path.join(zugDir, "observations.jsonl"),
    activeFile: path.join(zugDir, "ACTIVE.md"),
  };
}

export type ObservationType =
  | "cognitive_pattern"
  | "preference"
  | "mistake"
  | "breakthrough"
  | "context";

export interface Observation {
  timestamp: string;
  type: ObservationType;
  observation: string;
  session_id: string;
  confidence: "low" | "medium" | "high";
  context?: string;
}

function ensureDirs() {
  const { zugDir, sessionsDir } = getPaths();
  fs.mkdirSync(zugDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
}

export function readPersona(): string {
  ensureDirs();
  const { personaFile } = getPaths();
  if (!fs.existsSync(personaFile)) return "";
  return fs.readFileSync(personaFile, "utf-8");
}

export function readPlaybook(): string {
  ensureDirs();
  const { playbookFile } = getPaths();
  if (!fs.existsSync(playbookFile)) return "";
  return fs.readFileSync(playbookFile, "utf-8");
}

export function writePersona(content: string): void {
  ensureDirs();
  const { personaFile } = getPaths();
  fs.writeFileSync(personaFile, content, "utf-8");
}

export function writePlaybook(content: string): void {
  ensureDirs();
  const { playbookFile } = getPaths();
  fs.writeFileSync(playbookFile, content, "utf-8");
}

export function readActive(): string {
  ensureDirs();
  const { activeFile } = getPaths();
  if (!fs.existsSync(activeFile)) return "";
  return fs.readFileSync(activeFile, "utf-8");
}

export function writeActive(content: string): void {
  ensureDirs();
  const { activeFile } = getPaths();
  fs.writeFileSync(activeFile, content, "utf-8");
}

export function appendObservation(obs: Observation): void {
  ensureDirs();
  const { observationsFile } = getPaths();
  fs.appendFileSync(observationsFile, JSON.stringify(obs) + "\n", "utf-8");
}

export function getObservationsBySession(session_id: string): Observation[] {
  ensureDirs();
  const { observationsFile } = getPaths();
  if (!fs.existsSync(observationsFile)) return [];
  const lines = fs.readFileSync(observationsFile, "utf-8").split("\n").filter(Boolean);
  return lines
    .map((l) => {
      try { return JSON.parse(l) as Observation; } catch { return null; }
    })
    .filter((o): o is Observation => o !== null && o.session_id === session_id);
}

export function writeSession(session_id: string, content: string): void {
  ensureDirs();
  const { sessionsDir } = getPaths();
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(sessionsDir, `${date}-${session_id}.md`);
  fs.writeFileSync(file, content, "utf-8");
}

export function getRecentSessions(limit: number, context?: string): string[] {
  ensureDirs();
  const { sessionsDir } = getPaths();
  const files = fs.readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  const results: string[] = [];
  for (const f of files) {
    if (results.length >= limit) break;
    const content = fs.readFileSync(path.join(sessionsDir, f), "utf-8");
    if (context) {
      const escaped = context.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const hasContext = new RegExp(`^Context:\\s*${escaped}\\s*$`, "im").test(content);
      if (!hasContext) continue;
    }
    results.push(`## ${f}\n${content}`);
  }
  return results;
}

export function getStats(): { sessions: number; observations: number; personaLines: number } {
  ensureDirs();
  const { sessionsDir, observationsFile, personaFile } = getPaths();
  const sessions = fs.existsSync(sessionsDir)
    ? fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".md")).length
    : 0;
  const observations = fs.existsSync(observationsFile)
    ? fs.readFileSync(observationsFile, "utf-8").split("\n").filter(Boolean).length
    : 0;
  const personaLines = fs.existsSync(personaFile)
    ? fs.readFileSync(personaFile, "utf-8").split("\n").length
    : 0;
  return { sessions, observations, personaLines };
}

export function getLastSessionDate(): string | null {
  ensureDirs();
  const { sessionsDir } = getPaths();
  const files = fs.readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return files[0].slice(0, 10);
}

export function getPersonaExcerpt(maxLines = 2): string {
  ensureDirs();
  const { personaFile } = getPaths();
  if (!fs.existsSync(personaFile)) return "";
  const lines = fs.readFileSync(personaFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.trimStart().startsWith("#"));
  return lines.slice(0, maxLines).join(" ").trim();
}

export function getObservationTrend(weeks = 4): number[] {
  ensureDirs();
  const { observationsFile } = getPaths();
  const counts = Array(weeks).fill(0);
  if (!fs.existsSync(observationsFile)) return counts;

  const now = Date.now();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const windowStart = now - weeks * msPerWeek;

  const lines = fs.readFileSync(observationsFile, "utf-8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const obs = JSON.parse(line) as { timestamp: string };
      const ts = new Date(obs.timestamp).getTime();
      if (ts < windowStart || ts > now) continue;
      const weekIndex = Math.min(Math.floor((ts - windowStart) / msPerWeek), weeks - 1);
      if (weekIndex >= 0) counts[weekIndex]++;
    } catch {
      // skip malformed lines
    }
  }
  return counts;
}

export function syncRulesContext(): void {
  const rulesDir = process.env.CLAUDE_RULES_DIR ||
    path.join(os.homedir(), ".claude", "rules");
  if (!fs.existsSync(rulesDir)) return;

  const active = readActive();
  const excerpt = getPersonaExcerpt(3);
  if (!active && !excerpt) return;

  const sections: string[] = [
    "<!-- Zug context — auto-updated at session start. Do not edit manually. -->",
    "",
  ];

  if (active) {
    sections.push("## Active Patterns", "", active, "");
  }
  if (excerpt) {
    sections.push("## Who you're working with", "", excerpt, "");
  }

  try {
    fs.writeFileSync(path.join(rulesDir, "zug-context.md"), sections.join("\n"), "utf-8");
  } catch {
    // Best-effort — silently skip if rules dir is not writable
  }
}

export function getLastSessionSummary(): string | null {
  ensureDirs();
  const { sessionsDir } = getPaths();
  const files = fs.readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();
  if (files.length === 0) return null;

  const content = fs.readFileSync(path.join(sessionsDir, files[0]), "utf-8");
  const match = content.match(/^## Summary\n([\s\S]*?)(?=\n## |\n?$)/m);
  return match ? match[1].trim() : null;
}

export function getLastSessionTimestamp(): string | null {
  ensureDirs();
  const { sessionsDir } = getPaths();
  const files = fs.readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();
  if (files.length === 0) return null;

  const content = fs.readFileSync(path.join(sessionsDir, files[0]), "utf-8");
  const match = content.match(/^Date:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

export function getObservationsSince(since: string): Observation[] {
  ensureDirs();
  const { observationsFile } = getPaths();
  if (!fs.existsSync(observationsFile)) return [];

  const sinceMs = new Date(since).getTime();
  if (isNaN(sinceMs)) return [];

  const lines = fs.readFileSync(observationsFile, "utf-8").split("\n").filter(Boolean);
  const results: Observation[] = [];
  for (const line of lines) {
    try {
      const obs = JSON.parse(line) as Observation;
      if (new Date(obs.timestamp).getTime() > sinceMs) {
        results.push(obs);
      }
    } catch {
      // skip malformed lines
    }
  }
  // Newest first
  return results.reverse();
}
