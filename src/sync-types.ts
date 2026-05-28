import type { Observation, GrowthSnapshot, ReinforcedPattern, Lesson } from "./storage.js";
import type { SessionFile } from "./merge-core.js";

export interface SyncPayload {
  sourceId: string;
  observations: Observation[];
  sessions: SessionFile[];
  growth: GrowthSnapshot[];
  reinforcements: ReinforcedPattern[];
  lessons: Lesson[];
}
export interface PullResponse extends SyncPayload {
  persona: string; playbook: string; active: string; highWater: string;
}
export interface PushResult { accepted: Record<string, number>; highWater: string; }
