import type { Observation, GrowthSnapshot, ReinforcedPattern, Lesson, SynthesisStatus } from "./storage.js";
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
  /**
   * The canonical server's synthesis status (ISS-049). Null when it has never synthesized.
   *
   * Projected down like persona/playbook/active rather than merged: for a synced user the server is
   * the only thing that synthesizes, so last-writer-wins from the server is the correct semantics.
   * Without this, anything reading the local data directory — notably the T-058 dashboard — can
   * never see that synthesis failed, which is why the ISS-050 backlog went unnoticed for months.
   */
  synthesisStatus: SynthesisStatus | null;
}
export interface PushResult { accepted: Record<string, number>; highWater: string; }
