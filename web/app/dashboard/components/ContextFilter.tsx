import Link from 'next/link';
import { UNKNOWN_CONTEXT, type ContextBucket, type ContextCoverage } from '@/lib/zug-metrics';
import { STATUS } from '@/lib/chart-palette';

/**
 * Work / personal segmentation, driven by a ?context= search param rather than client state.
 *
 * The page is already a server component with force-dynamic, so a search param keeps everything
 * server-rendered, makes a filtered view linkable, and avoids a second source of interaction state
 * alongside the Recurrence slider.
 */
export function ContextFilter({
  buckets,
  coverage,
  active,
}: {
  buckets: ContextBucket[];
  coverage: ContextCoverage;
  active?: string;
}) {
  const chip = (label: string, count: number, href: string, isActive: boolean, muted = false) => (
    <Link
      key={label}
      href={href}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        isActive ? 'border-ink bg-ink text-cream' : 'border-ink/25 hover:bg-ink/5'
      } ${muted && !isActive ? 'text-ink/50' : ''}`}
    >
      {label} <span className="font-mono">{count}</span>
    </Link>
  );

  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs uppercase tracking-wide text-ink/50">Context</span>
        {chip('all', coverage.total, '/dashboard', !active)}
        {buckets.map((b) =>
          chip(
            b.context,
            b.count,
            `/dashboard?context=${encodeURIComponent(b.context)}`,
            active === b.context,
            b.context === UNKNOWN_CONTEXT,
          ),
        )}
      </div>

      {coverage.unknown > 0 && (
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink/70">
          <span className="font-mono" style={{ color: STATUS.warning }}>
            {coverage.unknown} of {coverage.total} observations ({100 - coverage.percent}%) carry no
            context.
          </span>{' '}
          They are counted in <span className="font-mono">unknown</span>, never dropped — a split
          that quietly omitted them would read as complete when it is not. Context is inherited from
          the session at session end, so coverage grows from here rather than backwards.
        </p>
      )}

      {active && (
        <p className="mt-2 max-w-2xl text-xs text-ink/60">
          Showing <span className="font-mono">{active}</span> only. Pipeline health, the persona and
          the active patterns below stay unfiltered: there is one PERSONA and one reinforcement
          store, not one per context, and showing them filtered would imply a split the system does
          not actually make.
        </p>
      )}
    </section>
  );
}
