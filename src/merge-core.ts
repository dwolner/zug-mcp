import { normalizeText, type Observation, type GrowthSnapshot, type ReinforcedPattern, type Lesson } from "./storage.js";

export interface SessionFile { filename: string; content: string; }

export function mergeObservations(base: Observation[], incoming: Observation[]): Observation[] {
  const key = (o: Observation) => `${o.timestamp}|${o.observation}`;
  const seen = new Map<string, Observation>();
  for (const o of [...base, ...incoming]) if (!seen.has(key(o))) seen.set(key(o), o);
  return [...seen.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function mergeSessions(base: SessionFile[], incoming: SessionFile[]): SessionFile[] {
  const byName = new Map<string, SessionFile>();
  for (const s of incoming) byName.set(s.filename, s);
  for (const s of base) byName.set(s.filename, s); // base wins on conflict
  return [...byName.values()];
}

export function mergeGrowth(base: GrowthSnapshot[], incoming: GrowthSnapshot[]): GrowthSnapshot[] {
  const key = (g: GrowthSnapshot) => `${g.timestamp}|${g.sessionId}`;
  const seen = new Map<string, GrowthSnapshot>();
  for (const g of [...base, ...incoming]) if (!seen.has(key(g))) seen.set(key(g), g);
  return [...seen.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function mergeReinforcements(base: ReinforcedPattern[], incoming: ReinforcedPattern[]): ReinforcedPattern[] {
  const byKey = new Map<string, ReinforcedPattern>();
  for (const p of [...base, ...incoming]) {
    const k = normalizeText(p.text);
    const cur = byKey.get(k);
    if (!cur) { byKey.set(k, { ...p }); continue; }
    byKey.set(k, {
      text: cur.lastSeen.localeCompare(p.lastSeen) >= 0 ? cur.text : p.text,
      count: Math.max(cur.count, p.count),
      lastSeen: cur.lastSeen.localeCompare(p.lastSeen) >= 0 ? cur.lastSeen : p.lastSeen,
    });
  }
  return [...byKey.values()];
}

export function mergeLessons(base: Lesson[], incoming: Lesson[]): Lesson[] {
  const byId = new Map<string, Lesson>();
  const wins = (a: Lesson, b: Lesson) => {
    const r = a.lastReinforced.localeCompare(b.lastReinforced);
    return (r !== 0 ? r : a.createdAt.localeCompare(b.createdAt)) >= 0 ? a : b;
  };
  for (const l of [...base, ...incoming]) {
    const cur = byId.get(l.id);
    byId.set(l.id, cur ? wins(cur, l) : l);
  }
  return [...byId.values()];
}
