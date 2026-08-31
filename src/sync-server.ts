import {
  getObservationsForSync, getGrowthSince, getAllReinforcements, readLessons,
  getAllSessionFiles, readPersona, readPlaybook, readActive,
  addObservations, addGrowth, addSessionFile, writeReinforcements,
  writeLessons, getTopPatterns, writePersonaAtomic, writePlaybookAtomic, writeActiveAtomic,
  getSynthesisHighWater, advanceSynthesisHighWater, readSynthesisStatus,
} from "./storage.js";
import { mergeReinforcements, mergeLessons } from "./merge-core.js";
import { synthesize } from "./synthesize.js";
import { getCurrentUserId } from "./tenancy.js";
import { enqueueSynthesis } from "./synthesis-queue.js";
import type { PullResponse, SyncPayload, PushResult } from "./sync-types.js";

/**
 * Most observations fed to one synthesis call. Input tokens are not the constraint — synthesis
 * re-emits the corpus, so the OUTPUT budget (ISS-046) tracks PERSONA size, not batch size. This
 * exists to keep a pathological backlog (a tenant offline for a year) from building an unbounded
 * prompt; the remainder drains on subsequent pushes.
 */
const SYNTHESIS_BATCH_LIMIT = 200;

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

  // Canonical synthesis over everything still UNSYNTHESIZED — routed through the per-user queue so it
  // is serialized per user and NON-BLOCKING: the push response returns immediately while synthesis
  // runs in the background (one user's synthesis can't block another's). Inputs and userId are
  // captured here in the active tenant scope; the queue re-enters that scope to run.
  //
  // ISS-050: this deliberately does NOT gate on `obsAdded` or read from `payload.observations`.
  // src/sync.ts advances the client's `pushSince` past everything it sends, so a given observation
  // is offered exactly once. Gating on a single push's delta therefore meant (a) a duplicate push
  // never synthesized, and (b) any observation whose one synthesis attempt failed was silently
  // dropped from PERSONA forever — 66 observations were lost that way between 2026-05-28 and
  // 2026-08-31. The cursor below is owned by the server and advances only on success, so a failed
  // attempt is retried on the next push instead.
  const pending = getObservationsForSync(getSynthesisHighWater())
    .filter((o) => o.confidence !== "low")
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (pending.length > 0) {
    // Bound the prompt when draining a long backlog. Oldest-first so the remainder is picked up by
    // the next push rather than skipped: the cursor advances only to the end of what was fed.
    const batch = pending.slice(0, SYNTHESIS_BATCH_LIMIT);
    const batchHighWater = batch[batch.length - 1].timestamp;
    const userId = getCurrentUserId();
    const synthInput = {
      currentPersona: readPersona(),
      currentPlaybook: readPlaybook(),
      sessionSummary: `Sync push from source ${payload.sourceId}: ${batch.length} unsynthesized observation(s).`,
      observations: batch.map((o) => ({ type: o.type, observation: o.observation, confidence: o.confidence })),
      reinforcedPatterns: getTopPatterns(10),
    };
    void enqueueSynthesis(userId, async () => {
      const result = await synthesize(synthInput);
      if (result) {
        writePersonaAtomic(result.persona);
        writePlaybookAtomic(result.playbook);
        if (result.active) writeActiveAtomic(result.active);
        // Only now is the batch genuinely absorbed. Advancing earlier would reintroduce the bug.
        advanceSynthesisHighWater(batchHighWater);
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
    synthesisStatus: readSynthesisStatus(),
    highWater: new Date().toISOString(),
  };
}
