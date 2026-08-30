'use client';

import { useMemo, useState } from 'react';
import { clusterTexts, PRODUCTION_THRESHOLD } from '@/lib/zug-cluster';
import { sequentialStep, MUTED, STATUS } from '@/lib/chart-palette';
import type { Observation } from '@/lib/zug-data';

/**
 * The reason this is a client component: the threshold is the thing being decided.
 *
 * ISS-048 will wire this matcher to an automatic gate at session end. Its jaccard/sharedCount
 * values are currently tuned for nothing in particular, and picking them blind gives you either a
 * matcher that never fires or one that collapses the whole corpus into a single cluster. Dragging
 * the slider against the real corpus is how that number gets chosen with evidence.
 *
 * Bars are sized by cluster count, so color here is SEQUENTIAL -- one hue, light to dark. Cluster
 * identity means nothing, so it gets no categorical hue.
 */
export function Recurrence({ observations }: { observations: Observation[] }) {
  const [jaccard, setJaccard] = useState(PRODUCTION_THRESHOLD.jaccard);
  const [sharedCount, setSharedCount] = useState(PRODUCTION_THRESHOLD.sharedCount);

  const clusters = useMemo(
    () => clusterTexts(observations, (o) => o.observation, { jaccard, sharedCount }),
    [observations, jaccard, sharedCount],
  );

  const recurring = clusters.filter((c) => c.members.length > 1);
  const promotable = clusters.filter((c) => c.members.length >= 3);
  const max = clusters[0]?.members.length ?? 1;
  const isProduction =
    jaccard === PRODUCTION_THRESHOLD.jaccard && sharedCount === PRODUCTION_THRESHOLD.sharedCount;

  return (
    <section>
      <h2 className="text-lg mb-1">Recurrence</h2>
      <p className="text-sm text-ink/70 mb-4 max-w-2xl">
        The server matcher run over all {observations.length} observations, read-only. Nothing here
        is written back — this is for choosing the threshold ISS-048 will gate on.
      </p>

      <div className="flex flex-wrap items-end gap-6 mb-4 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-ink/70">
            jaccard <span className="font-mono">{jaccard.toFixed(2)}</span>
          </span>
          <input type="range" min={0.05} max={0.95} step={0.05} value={jaccard}
                 onChange={(e) => setJaccard(Number(e.target.value))} className="w-56" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink/70">
            shared words <span className="font-mono">{sharedCount}</span>
          </span>
          <input type="range" min={1} max={6} step={1} value={sharedCount}
                 onChange={(e) => setSharedCount(Number(e.target.value))} className="w-40" />
        </label>
        <button type="button" onClick={() => { setJaccard(PRODUCTION_THRESHOLD.jaccard); setSharedCount(PRODUCTION_THRESHOLD.sharedCount); }}
                className="border border-ink/25 rounded px-2 py-1 hover:bg-ink/5">
          reset to production
        </button>
      </div>

      <p className="text-xs mb-4 font-mono" style={{ color: isProduction ? STATUS.critical : MUTED }}>
        {clusters.length} clusters · {recurring.length} recurring · {promotable.length} would reach
        the 3× promotion threshold
        {isProduction && ' — these are the values running in production today'}
      </p>

      {recurring.length === 0 ? (
        <p className="text-sm text-ink/70 max-w-2xl border border-ink/15 rounded-lg p-4 bg-white/40">
          {isProduction ? (
            <>
              No observation recurs at this threshold. That is the finding, not an empty state: at
              the values running in production today every observation is unique, so no pattern can
              ever reach 3× and the lesson pipeline cannot produce a candidate. Loosen the slider to
              see what a workable threshold would look like.
            </>
          ) : (
            <>
              No observation recurs at jaccard {jaccard.toFixed(2)} / {sharedCount} shared words.
              Loosen further, or reset to compare against the production values.
            </>
          )}
        </p>
      ) : (
        <ul className="max-w-3xl">
          {recurring.slice(0, 12).map((c) => (
            <li key={c.representative} className="grid grid-cols-[1fr_3rem] items-center gap-3 py-1">
              <span className="min-w-0">
                <span className="block h-4 rounded-sm mb-0.5"
                      style={{ width: `${(c.members.length / max) * 100}%`,
                               background: sequentialStep(c.members.length, max) }} />
                <span className="block truncate text-xs text-ink/75" title={c.representative}>
                  {c.representative}
                </span>
              </span>
              <span className="font-mono text-xs text-ink/70 text-right">{c.members.length}×</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
