import {
  getObservationsForSync, getGrowthSince, getAllReinforcements, readLessons,
  getAllSessionFiles, readPersona, readPlaybook, readActive,
} from "./storage.js";
import type { PullResponse } from "./sync-types.js";

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
