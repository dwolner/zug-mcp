/**
 * Read-only readers for the local Zug data directory (T-058).
 *
 * Deliberately NOT importing src/storage.ts, for two reasons:
 *   1. web/ is a separate workspace package whose tsconfig only includes app/**; reaching across
 *      it means build-config surgery for no benefit here.
 *   2. storage.ts calls ensureDirs() on nearly every read, which WRITES. A dashboard render must
 *      never mutate ~/.zug.
 *
 * Every reader returns empty/null on a missing file rather than throwing, so a fresh install
 * renders an empty dashboard instead of a stack trace.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface GrowthSnapshot {
  timestamp: string;
  sessionId: string;
  sessionCount: number;
  observationCount: number;
  personaLines: number;
  topPatterns: { text: string; count: number }[];
  activePatternCount: number;
  lessonCount: number;
}

export interface Observation {
  timestamp: string;
  type: string;
  observation: string;
  session_id: string;
  confidence: string;
  context?: string;
}

export interface ReinforcedPattern {
  text: string;
  count: number;
  lastSeen: string;
}

export interface SynthesisStatus {
  outcome: 'ok' | 'timeout' | 'truncated' | 'malformed' | 'no-api-key' | 'error';
  timestamp: string;
  detail?: string;
}

/** A citation lifted from a PERSONA bullet. `date` is optional -- not every citation carries one. */
export interface Citation {
  raw: string;
  date: string | null;
}

export interface PersonaBullet {
  text: string;
  citation: Citation | null;
}

export interface PersonaSection {
  heading: string;
  bullets: PersonaBullet[];
}

export function dataDir(): string {
  return process.env.ZUG_DATA_DIR || path.join(os.homedir(), '.zug');
}

function readText(file: string): string | null {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
  } catch {
    return null;
  }
}

function parseJsonl<T>(file: string): T[] {
  const raw = readText(file);
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((x): x is T => x !== null);
}

export function readGrowth(): GrowthSnapshot[] {
  return parseJsonl<GrowthSnapshot>(path.join(dataDir(), 'growth.jsonl'));
}

export function readObservations(): Observation[] {
  return parseJsonl<Observation>(path.join(dataDir(), 'observations.jsonl'));
}

export function readReinforcements(): ReinforcedPattern[] {
  return parseJsonl<ReinforcedPattern>(path.join(dataDir(), 'reinforcements.jsonl'));
}

export function readLessonCount(): number {
  return parseJsonl<unknown>(path.join(dataDir(), 'lessons.jsonl')).length;
}

export function readSynthesisStatus(): SynthesisStatus | null {
  const raw = readText(path.join(dataDir(), 'synthesis-status.json'));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SynthesisStatus;
  } catch {
    return null;
  }
}

/** Names only. We need dates, not 193 file bodies. */
export function readSessionFilenames(): string[] {
  try {
    return fs
      .readdirSync(path.join(dataDir(), 'sessions'))
      .filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
}

export function readPersonaRaw(): string {
  return readText(path.join(dataDir(), 'PERSONA.md')) ?? '';
}

export function readActivePatterns(): string[] {
  const raw = readText(path.join(dataDir(), 'ACTIVE.md')) ?? '';
  return raw
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

export function readPersonaSections(): PersonaSection[] {
  return parsePersonaSections(readPersonaRaw());
}

/**
 * Split PERSONA.md into its `## ` sections and lift each bullet's trailing citation.
 *
 * Citations appear in at least four shapes in the real file:
 *   *(2026-05-23)*
 *   *(session 2026-05-23)*
 *   *(direct quote: "..."; session 2026-04-24)*
 *   *(raised explicitly twice across sessions; most recent: "...")*   <- no date at all
 * so `date` is genuinely optional and `raw` is what always renders.
 *
 * Exported separately from the reader so it can be tested on plain strings.
 */
export function parsePersonaSections(raw: string): PersonaSection[] {
  const sections: PersonaSection[] = [];
  let current: PersonaSection | null = null;

  for (const line of raw.split('\n')) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      current = { heading: heading[1].trim(), bullets: [] };
      sections.push(current);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet && current) {
      current.bullets.push(parseBullet(bullet[1].trim()));
    }
  }
  return sections;
}

function parseBullet(body: string): PersonaBullet {
  // The character class must not cross a closing paren. A greedy /[^]*\)\*$/ would match from the
  // FIRST italic-paren group to the last on a bullet containing two, swallowing the body text
  // between them and capturing garbage. Allows one level of nested parens inside the citation.
  const match = body.match(/\s*\*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\*\s*$/);
  if (!match) return { text: body, citation: null };
  const raw = match[1].trim();
  const date = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    text: body.slice(0, match.index).trim(),
    citation: { raw, date: date ? date[1] : null },
  };
}
