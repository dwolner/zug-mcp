import { notFound } from 'next/navigation';
import {
  readGrowth,
  readObservations,
  readReinforcements,
  readLessonCount,
  readSynthesisStatus,
  readSessionFilenames,
  readPersonaSections,
  readActivePatterns,
  dataDir,
} from '@/lib/zug-data';
import {
  observationsPerWeek,
  sessionsPerDay,
  typeConfidenceBreakdown,
  pipelineHealth,
} from '@/lib/zug-metrics';
import { PipelineHealth } from './components/PipelineHealth';
import { Cadence } from './components/Cadence';
import { Accumulating } from './components/Accumulating';
import { Recurrence } from './components/Recurrence';
import { PersonaBrowser } from './components/PersonaBrowser';

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
export default function DashboardPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const growth = readGrowth();
  const observations = readObservations();
  const reinforcements = readReinforcements();
  const sessions = readSessionFilenames();
  const personaSections = readPersonaSections();
  const activePatterns = readActivePatterns();
  const health = pipelineHealth(growth, reinforcements, readSynthesisStatus(), readLessonCount());

  const empty = growth.length === 0 && observations.length === 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-2xl">Zug — instrument panel</h1>
        <p className="mt-1 text-sm text-ink/70">
          Local prototype. Reads <code className="font-mono text-xs">{dataDir()}</code> read-only and
          writes nothing.
        </p>
      </header>

      {empty ? (
        <p className="border border-ink/15 rounded-lg p-4 bg-white/40 text-sm text-ink/70">
          No data found in <code className="font-mono text-xs">{dataDir()}</code>. Set{' '}
          <code className="font-mono text-xs">ZUG_DATA_DIR</code> if your data lives elsewhere.
        </p>
      ) : (
        <div className="space-y-12">
          <PipelineHealth health={health} />
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
