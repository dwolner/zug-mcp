import fs from "fs";
import path from "path";
import os from "os";
import { getSourceId } from "./sync-state.js";
// Function-level import only: these are called inside getPaths(), never at module init, so the
// storage<->tenancy cycle is safe (mirrors the storage<->sync-state pattern).
import { getCurrentUserId, getUsersRoot, assertSafeUserId } from "./tenancy.js";

export function getDataDir(): string {
  return process.env.ZUG_DATA_DIR || path.join(os.homedir(), ".zug");
}

/**
 * Resolve all storage paths for the active tenant. With a tenant scope (or an explicit
 * userIdOverride) content lives under <usersRoot>/<userId>/.zug; without one it falls back to the
 * flat legacy dir (stdio / local / tests). Exported so sync-state's getSourceId can namespace too.
 */
export function getPaths(userIdOverride?: string) {
  const uid = userIdOverride ?? getCurrentUserId();
  let zugDir: string;
  if (uid) {
    assertSafeUserId(uid);
    const root = getUsersRoot();
    zugDir = path.join(root, uid, ".zug");
    // Defense-in-depth: the resolved tenant dir must stay under the users root.
    if (!path.resolve(zugDir).startsWith(path.resolve(root) + path.sep)) {
      throw new Error(`Tenant path escapes users root: ${uid}`);
    }
  } else {
    zugDir = getDataDir();
  }
  return {
    zugDir,
    sessionsDir: path.join(zugDir, "sessions"),
    personaFile: path.join(zugDir, "PERSONA.md"),
    playbookFile: path.join(zugDir, "PLAYBOOK.md"),
    observationsFile: path.join(zugDir, "observations.jsonl"),
    activeFile: path.join(zugDir, "ACTIVE.md"),
    reinforcementsFile: path.join(zugDir, "reinforcements.jsonl"),
    lessonsFile: path.join(zugDir, "lessons.jsonl"),
    growthFile: path.join(zugDir, "growth.jsonl"),
    openThreadFile: path.join(zugDir, "open-thread.json"),
    synthesisStatusFile: path.join(zugDir, "synthesis-status.json"),
  };
}

export interface SocraticThread {
  question: string;
  openedAt: string;
  sessionId: string;
}

export function readOpenThread(): SocraticThread | null {
  const { openThreadFile } = getPaths();
  if (!fs.existsSync(openThreadFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(openThreadFile, "utf-8")) as SocraticThread;
  } catch {
    return null;
  }
}

export function writeOpenThread(thread: SocraticThread | null): void {
  ensureDirs();
  const { openThreadFile } = getPaths();
  if (thread === null) {
    if (fs.existsSync(openThreadFile)) fs.unlinkSync(openThreadFile);
  } else {
    fs.writeFileSync(openThreadFile, JSON.stringify(thread), "utf-8");
  }
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

export function archiveSessions(ageDays = 90): { archived: number } {
  ensureDirs();
  const { sessionsDir } = getPaths();
  const archiveDir = path.join(sessionsDir, "archive");
  const cutoff = Date.now() - ageDays * 24 * 60 * 60 * 1000;

  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".md"));
  let archived = 0;

  for (const f of files) {
    const dateStr = f.slice(0, 10);
    const ts = new Date(dateStr).getTime();
    if (isNaN(ts) || ts >= cutoff) continue;
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.renameSync(path.join(sessionsDir, f), path.join(archiveDir, f));
    archived++;
  }

  return { archived };
}

export function archiveObservations(): void {
  const { observationsFile } = getPaths();
  if (!fs.existsSync(observationsFile)) return;
  const lines = fs.readFileSync(observationsFile, "utf-8").split("\n").filter(Boolean);
  if (lines.length === 0) return;
  const archiveFile = path.join(path.dirname(observationsFile), "observations.archive.jsonl");
  fs.appendFileSync(archiveFile, lines.join("\n") + "\n", "utf-8");
  fs.writeFileSync(observationsFile, "", "utf-8");
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

export interface ReinforcedPattern {
  text: string;
  count: number;
  lastSeen: string;
}

export interface ReinforceResult {
  pattern: ReinforcedPattern;
  matched: boolean;
  similarity: number;
}

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "has", "have", "not", "but", "all"]);

// Jaccard similarity over content words (>2 chars, not stop words).
// Exported so web/lib/zug-cluster.ts (T-058) can be asserted against the SAME fixture as this
// implementation. The dashboard's threshold slider only means anything if the matcher it tunes
// against behaves identically to this one, which ISS-048 will gate on.
export function wordSimilarity(a: string, b: string): { jaccard: number; sharedCount: number } {
  const words = (s: string) => new Set(normalizeText(s).split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
  const A = words(a);
  const B = words(b);
  const shared = [...A].filter((w) => B.has(w));
  const union = new Set([...A, ...B]).size;
  return { jaccard: union > 0 ? shared.length / union : 0, sharedCount: shared.length };
}

function findBestMatch(patterns: ReinforcedPattern[], text: string): { idx: number; similarity: number } {
  const norm = normalizeText(text);
  let bestIdx = -1;
  let bestSim = 0;

  for (let i = 0; i < patterns.length; i++) {
    if (normalizeText(patterns[i].text) === norm) return { idx: i, similarity: 1 };
    const { jaccard, sharedCount } = wordSimilarity(patterns[i].text, text);
    // Require both ratio threshold AND at least 2 shared content words
    if (jaccard >= 0.4 && sharedCount >= 2 && jaccard > bestSim) {
      bestSim = jaccard;
      bestIdx = i;
    }
  }

  return { idx: bestIdx, similarity: bestSim };
}

function loadPatterns(reinforcementsFile: string): ReinforcedPattern[] {
  if (!fs.existsSync(reinforcementsFile)) return [];
  return fs.readFileSync(reinforcementsFile, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as ReinforcedPattern; } catch { return null; } })
    .filter((p): p is ReinforcedPattern => p !== null);
}

export function reinforcePattern(text: string): ReinforceResult {
  ensureDirs();
  const { reinforcementsFile } = getPaths();

  const patterns = loadPatterns(reinforcementsFile);
  const { idx, similarity } = findBestMatch(patterns, text);

  const updated: ReinforcedPattern = idx >= 0
    ? { ...patterns[idx], count: patterns[idx].count + 1, lastSeen: new Date().toISOString() }
    : { text, count: 1, lastSeen: new Date().toISOString() };

  if (idx >= 0) {
    patterns[idx] = updated;
  } else {
    patterns.push(updated);
  }

  fs.writeFileSync(reinforcementsFile, patterns.map((p) => JSON.stringify(p)).join("\n") + "\n", "utf-8");
  return { pattern: updated, matched: idx >= 0, similarity };
}

export function getTopPatterns(limit: number): ReinforcedPattern[] {
  ensureDirs();
  const { reinforcementsFile } = getPaths();
  return loadPatterns(reinforcementsFile)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// --- Lesson system ---
// Concurrency assumption: single-process Node.js MCP server; event loop serializes
// synchronous calls, so no file locking is needed.

export interface Lesson {
  id: string;
  title: string;
  content: string;
  context: string;
  source: "review" | "correction" | "postmortem" | "manual";
  tags: string[];
  status: "active" | "validated" | "deprecated";
  createdAt: string;
  lastReinforced: string;
  reinforcementCount: number;
  supersedes?: string;
}

export function readLessons(): Lesson[] {
  ensureDirs();
  const { lessonsFile } = getPaths();
  if (!fs.existsSync(lessonsFile)) return [];
  return fs.readFileSync(lessonsFile, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as Lesson; } catch { return null; } })
    .filter((l): l is Lesson => l !== null);
}

export function writeLessons(lessons: Lesson[]): void {
  ensureDirs();
  const { lessonsFile } = getPaths();
  fs.writeFileSync(lessonsFile, lessons.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");
}

function mutateLessons(fn: (lessons: Lesson[]) => Lesson[]): void {
  ensureDirs();
  writeLessons(fn(readLessons()));
}

export function createLesson(
  data: Omit<Lesson, "id" | "createdAt" | "lastReinforced" | "reinforcementCount" | "status">
): Lesson {
  let created!: Lesson;
  const tag = getSourceId();
  mutateLessons((lessons) => {
    const maxSeq = lessons.reduce((max, l) => {
      const m = l.id.match(new RegExp(`^L-${tag}-(\\d+)$`));
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const id = `L-${tag}-${maxSeq + 1}`;
    const now = new Date().toISOString();
    created = { ...data, id, status: "active", createdAt: now, lastReinforced: now, reinforcementCount: 0 };
    return [...lessons, created];
  });
  return created;
}

export function getLessonById(id: string): Lesson | null {
  ensureDirs();
  return readLessons().find((l) => l.id === id) ?? null;
}

export function updateLesson(
  id: string,
  updates: Partial<Pick<Lesson, "title" | "content" | "context" | "tags" | "status" | "supersedes">>
): Lesson | null {
  let updated: Lesson | null = null;
  mutateLessons((lessons) =>
    lessons.map((l) => {
      if (l.id !== id) return l;
      updated = { ...l, ...updates };
      return updated;
    })
  );
  return updated;
}

export function reinforceLesson(id: string): Lesson | null {
  let updated: Lesson | null = null;
  mutateLessons((lessons) =>
    lessons.map((l) => {
      if (l.id !== id) return l;
      updated = { ...l, reinforcementCount: l.reinforcementCount + 1, lastReinforced: new Date().toISOString() };
      return updated;
    })
  );
  return updated;
}

export function getActiveLessons(): Lesson[] {
  ensureDirs();
  return readLessons()
    .filter((l) => l.status === "active")
    .sort((a, b) =>
      b.reinforcementCount !== a.reinforcementCount
        ? b.reinforcementCount - a.reinforcementCount
        : a.createdAt.localeCompare(b.createdAt)
    );
}

export function getLessonCandidates(threshold = 3): ReinforcedPattern[] {
  const { reinforcementsFile } = getPaths();
  const patterns = loadPatterns(reinforcementsFile);
  const lessons = getActiveLessons();

  return patterns
    .filter((p) => p.count >= threshold)
    .filter((p) =>
      !lessons.some(
        (l) =>
          wordSimilarity(p.text, l.title).sharedCount >= 2 ||
          wordSimilarity(p.text, l.content).sharedCount >= 2
      )
    )
    .sort((a, b) => b.count - a.count);
}

// --- Growth snapshots ---

export interface GrowthSnapshot {
  timestamp: string;
  sessionId: string;
  sessionCount: number;
  observationCount: number;
  personaLines: number;
  topPatterns: Array<{ text: string; count: number }>;
  activePatternCount: number;
  lessonCount: number;
}

export function appendGrowthSnapshot(snapshot: GrowthSnapshot): void {
  ensureDirs();
  const { growthFile } = getPaths();
  fs.appendFileSync(growthFile, JSON.stringify(snapshot) + "\n", "utf-8");
}

export function readGrowthSnapshots(): GrowthSnapshot[] {
  ensureDirs();
  const { growthFile } = getPaths();
  if (!fs.existsSync(growthFile)) return [];
  return fs.readFileSync(growthFile, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as GrowthSnapshot; } catch { return null; } })
    .filter((s): s is GrowthSnapshot => s !== null);
}

export function getGrowthTrend(limit: number): GrowthSnapshot[] {
  return readGrowthSnapshots()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export function getStaleGrowthWarning(n = 3): string | null {
  const snapshots = getGrowthTrend(n);
  if (snapshots.length < 2) return null;
  const counts = snapshots.map((s) => s.observationCount);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  if (max > min) return null;
  return `No new observations in the last ${snapshots.length} sessions. Call zug_save_observation when you notice patterns.`;
}

// --- Synthesis outcome (ISS-047) ---
//
// Synthesis is fire-and-forget: enqueueSynthesis() catches task errors so one failure cannot wedge
// a user's chain. That made every failure invisible outside the server's stdout, and the outage it
// hid ran for three months. The outcome is therefore persisted per-tenant so it survives the
// process and can be surfaced to the user who is actually affected by it.

export type SynthesisOutcome = "ok" | "timeout" | "truncated" | "malformed" | "no-api-key" | "error";

export interface SynthesisStatus {
  outcome: SynthesisOutcome;
  timestamp: string;
  detail?: string;
}

/** Record the result of the most recent synthesis. Best-effort: never throws into the caller. */
export function recordSynthesisOutcome(outcome: SynthesisOutcome, detail?: string): void {
  try {
    ensureDirs();
    const { synthesisStatusFile } = getPaths();
    const status: SynthesisStatus = {
      outcome,
      timestamp: new Date().toISOString(),
      ...(detail ? { detail } : {}),
    };
    fs.writeFileSync(synthesisStatusFile, JSON.stringify(status, null, 2), "utf-8");
  } catch { /* best-effort: observability must never break the thing it observes */ }
}

export function readSynthesisStatus(): SynthesisStatus | null {
  const { synthesisStatusFile } = getPaths();
  if (!fs.existsSync(synthesisStatusFile)) return null;
  try { return JSON.parse(fs.readFileSync(synthesisStatusFile, "utf-8")) as SynthesisStatus; }
  catch { return null; }
}

/** Human-readable warning when the last synthesis did not succeed. Null when it did, or never ran. */
export function getSynthesisWarning(): string | null {
  const status = readSynthesisStatus();
  if (!status || status.outcome === "ok") return null;
  const detail = status.detail ? ` — ${status.detail}` : "";
  return `Last synthesis failed (${status.outcome}) at ${status.timestamp}${detail}. PERSONA is not being updated.`;
}

/**
 * Detect the ISS-045 signature from data growth.jsonl already records: observations accumulating
 * while PERSONA never changes. getStaleGrowthWarning watches the INPUT (are observations arriving)
 * and so stayed silent through the entire outage; this watches the OUTPUT.
 */
export function getFrozenPersonaWarning(n = 10): string | null {
  const snapshots = getGrowthTrend(n); // newest first
  if (snapshots.length < 2) return null;

  const lines = snapshots.map((s) => s.personaLines);
  if (new Set(lines).size > 1) return null; // persona is moving — nothing to report

  const newest = snapshots[0].observationCount;
  const oldest = snapshots[snapshots.length - 1].observationCount;
  if (newest <= oldest) return null; // nothing accumulating either; that is the stale-input case

  return `PERSONA has not changed across the last ${snapshots.length} sessions (${lines[0]} lines) ` +
    `while observations grew ${oldest} → ${newest}. Synthesis is taking input without producing output.`;
}

// --- Sync storage helpers ---

function parseJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf-8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as T; } catch { return null; } })
    .filter((x): x is T => x !== null);
}

export function getAllObservations(): Observation[] {
  const { observationsFile, zugDir } = getPaths();
  const archive = path.join(zugDir, "observations.archive.jsonl");
  return [...parseJsonl<Observation>(observationsFile), ...parseJsonl<Observation>(archive)];
}

export function getObservationsForSync(sinceISO: string): Observation[] {
  const since = new Date(sinceISO).getTime();
  if (isNaN(since)) return [];
  return getAllObservations().filter((o) => new Date(o.timestamp).getTime() > since);
}

/** Append observations whose timestamp|observation key is not already present. Returns count added. */
export function addObservations(incoming: Observation[]): number {
  ensureDirs();
  const { observationsFile } = getPaths();
  const seen = new Set(getAllObservations().map((o) => `${o.timestamp}|${o.observation}`));
  let added = 0;
  for (const o of incoming) {
    const k = `${o.timestamp}|${o.observation}`;
    if (seen.has(k)) continue;
    fs.appendFileSync(observationsFile, JSON.stringify(o) + "\n", "utf-8");
    seen.add(k); added++;
  }
  return added;
}

export function getGrowthSince(sinceISO: string): GrowthSnapshot[] {
  const since = new Date(sinceISO).getTime();
  return readGrowthSnapshots().filter((g) => new Date(g.timestamp).getTime() > since);
}

/** Append growth snapshots not already present (by timestamp|sessionId). Returns count added. */
export function addGrowth(incoming: GrowthSnapshot[]): number {
  ensureDirs();
  const seen = new Set(readGrowthSnapshots().map((g) => `${g.timestamp}|${g.sessionId}`));
  let added = 0;
  for (const g of incoming) {
    if (seen.has(`${g.timestamp}|${g.sessionId}`)) continue;
    appendGrowthSnapshot(g); seen.add(`${g.timestamp}|${g.sessionId}`); added++;
  }
  return added;
}

/** Reads all reinforced patterns. Delegates to loadPatterns to stay DRY. */
export function getAllReinforcements(): ReinforcedPattern[] {
  return loadPatterns(getPaths().reinforcementsFile);
}

export function writeReinforcements(patterns: ReinforcedPattern[]): void {
  ensureDirs();
  const { reinforcementsFile } = getPaths();
  fs.writeFileSync(reinforcementsFile, patterns.map((p) => JSON.stringify(p)).join("\n") + "\n", "utf-8");
}

function atomicWrite(file: string, content: string): void {
  ensureDirs();
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, file);
}

export function writePersonaAtomic(content: string): void { atomicWrite(getPaths().personaFile, content); }
export function writePlaybookAtomic(content: string): void { atomicWrite(getPaths().playbookFile, content); }
export function writeActiveAtomic(content: string): void { atomicWrite(getPaths().activeFile, content); }

/** Return all session files as {filename, content}, excluding the archive subdir. */
export function getAllSessionFiles(): { filename: string; content: string }[] {
  ensureDirs();
  const { sessionsDir } = getPaths();
  return fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".md")).sort()
    .map((filename) => ({ filename, content: fs.readFileSync(path.join(sessionsDir, filename), "utf-8") }));
}

/** Write a session file by exact filename if absent. Returns true if written. */
export function addSessionFile(filename: string, content: string): boolean {
  ensureDirs();
  const { sessionsDir } = getPaths();
  const dest = path.join(sessionsDir, filename);
  if (fs.existsSync(dest)) return false;
  fs.writeFileSync(dest, content, "utf-8");
  return true;
}
