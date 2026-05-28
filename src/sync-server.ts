import {
  getObservationsForSync, getGrowthSince, getAllReinforcements, readLessons,
  getAllSessionFiles, readPersona, readPlaybook, readActive,
  addObservations, addGrowth, addSessionFile, writeReinforcements,
  writeLessons, getTopPatterns, writePersonaAtomic, writePlaybookAtomic, writeActiveAtomic,
} from "./storage.js";
import { mergeReinforcements, mergeLessons } from "./merge-core.js";
import { synthesize } from "./synthesize.js";
import type { PullResponse, SyncPayload, PushResult } from "./sync-types.js";

export async function handleSyncPush(payload: SyncPayload): Promise<PushResult> {
  const obsAdded = addObservations(payload.observations);
  let sessAdded = 0;
  for (const s of payload.sessions) if (addSessionFile(s.filename, s.content)) sessAdded++;
  const growthAdded = addGrowth(payload.growth);

  if (payload.reinforcements.length) {
    writeReinforcements(mergeReinforcements(getAllReinforcements(), payload.reinforcements));
  }
  const lessonsBefore = readLessons().length;
  if (payload.lessons.length) {
    writeLessons(mergeLessons(readLessons(), payload.lessons));
  }

  // Canonical synthesis over newly-pushed meaningful observations.
  const meaningful = payload.observations.filter((o) => o.confidence !== "low");
  if (obsAdded > 0 && meaningful.length > 0) {
    try {
      const result = await synthesize({
        currentPersona: readPersona(),
        currentPlaybook: readPlaybook(),
        sessionSummary: `Sync push from source ${payload.sourceId}: ${meaningful.length} new observation(s).`,
        observations: meaningful.map((o) => ({ type: o.type, observation: o.observation, confidence: o.confidence })),
        reinforcedPatterns: getTopPatterns(10),
      });
      if (result) {
        writePersonaAtomic(result.persona);
        writePlaybookAtomic(result.playbook);
        if (result.active) writeActiveAtomic(result.active);
      }
    } catch (err) {
      console.error("[zug] sync-push synthesis failed:", err instanceof Error ? err.message : err);
    }
  }

  return {
    accepted: {
      observations: obsAdded, sessions: sessAdded, growth: growthAdded,
      reinforcements: payload.reinforcements.length, lessons: Math.max(0, readLessons().length - lessonsBefore),
    },
    highWater: new Date().toISOString(),
  };
}

export function handleSyncPull(sinceISO: string): PullResponse {
  const sinceDay = sinceISO.slice(0, 10);
  return {
    sourceId: "server",
    observations: getObservationsForSync(sinceISO),
    sessions: getAllSessionFiles().filter((s) => s.filename.slice(0, 10) >= sinceDay),
    growth: getGrowthSince(sinceISO),
    reinforcements: getAllReinforcements(),
    lessons: readLessons(),
    persona: readPersona(),
    playbook: readPlaybook(),
    active: readActive(),
    highWater: new Date().toISOString(),
  };
}
