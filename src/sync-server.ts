import {
  getObservationsForSync, getGrowthSince, getAllReinforcements, readLessons,
  getAllSessionFiles, readPersona, readPlaybook, readActive,
  addObservations, addGrowth, addSessionFile, writeReinforcements,
  writeLessons, getTopPatterns, writePersonaAtomic, writePlaybookAtomic, writeActiveAtomic,
} from "./storage.js";
import { mergeReinforcements, mergeLessons } from "./merge-core.js";
import { synthesize } from "./synthesize.js";
import { getCurrentUserId } from "./tenancy.js";
import { enqueueSynthesis } from "./synthesis-queue.js";
import type { PullResponse, SyncPayload, PushResult } from "./sync-types.js";

export async function handleSyncPush(payload: SyncPayload): Promise<PushResult> {
  const obsAdded = addObservations(payload.observations);
  let sessAdded = 0;
  for (const s of payload.sessions) if (addSessionFile(s.filename, s.content)) sessAdded++;
  const growthAdded = addGrowth(payload.growth);

  let reinforcementsAdded = 0;
  if (payload.reinforcements.length) {
    const before = getAllReinforcements();
    const merged = mergeReinforcements(before, payload.reinforcements);
    writeReinforcements(merged);
    reinforcementsAdded = merged.length - before.length;
  }

  let lessonsAdded = 0;
  if (payload.lessons.length) {
    const before = readLessons();
    const merged = mergeLessons(before, payload.lessons);
    writeLessons(merged);
    lessonsAdded = merged.length - before.length;
  }

  // Canonical synthesis over newly-pushed meaningful observations — routed through the per-user
  // queue so it is serialized per user and NON-BLOCKING: the push response returns immediately while
  // synthesis runs in the background (one user's synthesis can't block another's). Inputs and userId
  // are captured here in the active tenant scope; the queue re-enters that scope to run.
  const meaningful = payload.observations.filter((o) => o.confidence !== "low");
  if (obsAdded > 0 && meaningful.length > 0) {
    const userId = getCurrentUserId();
    const synthInput = {
      currentPersona: readPersona(),
      currentPlaybook: readPlaybook(),
      sessionSummary: `Sync push from source ${payload.sourceId}: ${meaningful.length} new observation(s).`,
      observations: meaningful.map((o) => ({ type: o.type, observation: o.observation, confidence: o.confidence })),
      reinforcedPatterns: getTopPatterns(10),
    };
    void enqueueSynthesis(userId, async () => {
      const result = await synthesize(synthInput);
      if (result) {
        writePersonaAtomic(result.persona);
        writePlaybookAtomic(result.playbook);
        if (result.active) writeActiveAtomic(result.active);
      }
    });
  }

  return {
    accepted: {
      observations: obsAdded, sessions: sessAdded, growth: growthAdded,
      reinforcements: reinforcementsAdded, lessons: lessonsAdded,
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
