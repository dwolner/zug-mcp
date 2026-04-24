import fs from "fs";
import path from "path";
import os from "os";

const ZUG_DIR = path.join(os.homedir(), ".zug");
const SESSIONS_DIR = path.join(ZUG_DIR, "sessions");
const PERSONA_FILE = path.join(ZUG_DIR, "PERSONA.md");
const PLAYBOOK_FILE = path.join(ZUG_DIR, "PLAYBOOK.md");
const OBSERVATIONS_FILE = path.join(ZUG_DIR, "observations.jsonl");
const ACTIVE_FILE = path.join(ZUG_DIR, "ACTIVE.md");

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
}

function ensureDirs() {
  fs.mkdirSync(ZUG_DIR, { recursive: true });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function readPersona(): string {
  ensureDirs();
  if (!fs.existsSync(PERSONA_FILE)) return "";
  return fs.readFileSync(PERSONA_FILE, "utf-8");
}

export function readPlaybook(): string {
  ensureDirs();
  if (!fs.existsSync(PLAYBOOK_FILE)) return "";
  return fs.readFileSync(PLAYBOOK_FILE, "utf-8");
}

export function writePersona(content: string): void {
  ensureDirs();
  fs.writeFileSync(PERSONA_FILE, content, "utf-8");
}

export function writePlaybook(content: string): void {
  ensureDirs();
  fs.writeFileSync(PLAYBOOK_FILE, content, "utf-8");
}

export function readActive(): string {
  ensureDirs();
  if (!fs.existsSync(ACTIVE_FILE)) return "";
  return fs.readFileSync(ACTIVE_FILE, "utf-8");
}

export function writeActive(content: string): void {
  ensureDirs();
  fs.writeFileSync(ACTIVE_FILE, content, "utf-8");
}

export function appendObservation(obs: Observation): void {
  ensureDirs();
  fs.appendFileSync(OBSERVATIONS_FILE, JSON.stringify(obs) + "\n", "utf-8");
}

export function getObservationsBySession(session_id: string): Observation[] {
  ensureDirs();
  if (!fs.existsSync(OBSERVATIONS_FILE)) return [];
  const lines = fs.readFileSync(OBSERVATIONS_FILE, "utf-8").split("\n").filter(Boolean);
  return lines
    .map((l) => {
      try { return JSON.parse(l) as Observation; } catch { return null; }
    })
    .filter((o): o is Observation => o !== null && o.session_id === session_id);
}

export function writeSession(session_id: string, content: string): void {
  ensureDirs();
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(SESSIONS_DIR, `${date}-${session_id}.md`);
  fs.writeFileSync(file, content, "utf-8");
}

export function getRecentSessions(limit: number): string[] {
  ensureDirs();
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse()
    .slice(0, limit);
  return files.map((f) => {
    const content = fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8");
    return `## ${f}\n${content}`;
  });
}

export function getStats(): { sessions: number; observations: number; personaLines: number } {
  ensureDirs();
  const sessions = fs.existsSync(SESSIONS_DIR)
    ? fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".md")).length
    : 0;
  const observations = fs.existsSync(OBSERVATIONS_FILE)
    ? fs.readFileSync(OBSERVATIONS_FILE, "utf-8").split("\n").filter(Boolean).length
    : 0;
  const personaLines = fs.existsSync(PERSONA_FILE)
    ? fs.readFileSync(PERSONA_FILE, "utf-8").split("\n").length
    : 0;
  return { sessions, observations, personaLines };
}
