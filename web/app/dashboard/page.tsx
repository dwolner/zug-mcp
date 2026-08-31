import { notFound } from 'next/navigation';
import { loadSnapshot } from '@/lib/zug-data';
import {
  observationsPerWeek,
  sessionsPerDay,
  typeConfidenceBreakdown,
  pipelineHealth,
  contextBuckets,
  contextCoverage,
  filterByContext,
} from '@/lib/zug-metrics';
import { PipelineHealth } from './components/PipelineHealth';
import { Cadence } from './components/Cadence';
import { Accumulating } from './components/Accumulating';
import { Recurrence } from './components/Recurrence';
import { PersonaBrowser } from './components/PersonaBrowser';
import { ContextFilter } from './components/ContextFilter';

// Re-read the data directory on every request, so a refresh reflects the session that just ended.
export const dynamic = 'force-dynamic';

/**
 * Local prototype (T-058). Never ships.
 *
 * web/ deploys to Fly, where ~/.zug does not exist, so the route is gated off in production.
 *
 * Be precise about what that gate is: `next build` still emits this route (it appears as
 * "f /dashboard" in the build output) and the module ships in the container. The gate is a RUNTIME
 * 404, not a build-time exclusion. That is sufficient -- notFound() is the first statement, before
 * any read, so in production the page never touches the filesystem and no data is reachable -- but
 * it is not the same as the code being absent, and claiming otherwise would be wrong.
 *
 * Note also that NODE_ENV is 'production' during `next build` and `next start`, so this 404s in a
 * LOCAL production build too, not only on Fly. That is intended -- this is a `pnpm dev` tool -- and
 * it is written down because otherwise it reads as a bug six months from now.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ context?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const {
    source,
    growth,
    observations: allObservations,
    reinforcements,
    sessionFilenames: sessions,
    sessionContexts,
    personaSections,
    activePatterns,
    synthesisStatus,
    lessonCount,
  } = await loadSnapshot();
  const health = pipelineHealth(
    growth,
    reinforcements,
    synthesisStatus,
    lessonCount,
    allObservations,
  );

  const activeContext = (await searchParams)?.context;
  const buckets = contextBuckets(allObservations, sessionContexts);
  const coverage = contextCoverage(allObservations, sessionContexts);
  const observations = filterByContext(allObservations, sessionContexts, activeContext);

  const empty = growth.length === 0 && allObservations.length === 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-2xl">Zug — instrument panel</h1>
        <p className="mt-1 text-sm text-ink/70">
          Local prototype. Reads <code className="font-mono text-xs">{source.label}</code> read-only
          and writes nothing.{' '}
          {source.kind === 'remote' ? (
            <span className="text-ink/60">
              Live server — this is the authoritative pipeline state.
            </span>
          ) : (
            <span className="text-ink/60">
              Local mirror — refreshed only by the SessionStart <code className="font-mono text-xs">zug pull</code>,
              so it can trail the server by a synthesis cycle (T-062). Set{' '}
              <code className="font-mono text-xs">ZUG_URL</code> and{' '}
              <code className="font-mono text-xs">ZUG_TOKEN</code> to read the server instead.
            </span>
          )}
        </p>
      </header>

      {empty ? (
        <p className="border border-ink/15 rounded-lg p-4 bg-white/40 text-sm text-ink/70">
          No data found in <code className="font-mono text-xs">{source.label}</code>. Set{' '}
          <code className="font-mono text-xs">ZUG_DATA_DIR</code> if your data lives elsewhere, or{' '}
          <code className="font-mono text-xs">ZUG_URL</code> +{' '}
          <code className="font-mono text-xs">ZUG_TOKEN</code> to read the server.
        </p>
      ) : (
        <div className="space-y-12">
          {/* Global, deliberately above the filter: these are not per-context. */}
          <PipelineHealth health={health} />

          <ContextFilter buckets={buckets} coverage={coverage} active={activeContext} />
          <Cadence
            observationWeeks={observationsPerWeek(observations)}
            sessionDays={sessionsPerDay(sessions)}
          />
          <Accumulating breakdown={typeConfidenceBreakdown(observations)} />
          <Recurrence observations={observations} />
          <PersonaBrowser sections={personaSections} />

          {activePatterns.length > 0 && (
            <section>
              <h2 className="text-lg mb-1">Active patterns</h2>
              <p className="text-sm text-ink/70 mb-4 max-w-2xl">
                The behavioural frame loaded at the start of every session.
              </p>
              <ul className="max-w-3xl space-y-2">
                {activePatterns.map((p, i) => (
                  <li key={i} className="border-l-2 border-ink/20 pl-3 text-xs leading-relaxed text-ink/80">
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
