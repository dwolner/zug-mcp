import { BAND_INK, MUTED, GRID } from '@/lib/chart-palette';
import type { Bucket } from '@/lib/zug-metrics';
import { BarBand, makeTimeScale, monthTicks } from './Chart';

const WIDTH = 900;
const BAND = 70;

/**
 * Two bands, one shared x-scale. NOT a dual-axis chart.
 *
 * Both bands are painted one neutral ink, NOT categorical hues. The type hues are bound to
 * observation types in the section below, legend and all; reusing clay here would tell a reader
 * that this band is cognitive_pattern observations rather than all of them. Each band is a single
 * titled series, so it needs no identity color at all.
 *
 * A side effect worth seeing: the two series cover different horizons. Observations reach back to
 * March; sessions only to June, because sessions older than 90 days are archived out of the
 * directory. The shared axis makes that visible instead of implying the record starts in June.
 */
export function Cadence({
  observationWeeks,
  sessionDays,
}: {
  observationWeeks: Bucket[];
  sessionDays: Bucket[];
}) {
  const scale = makeTimeScale(
    [...observationWeeks.map((b) => b.date), ...sessionDays.map((b) => b.date)],
    WIDTH,
  );
  if (!scale) return null;
  const ticks = monthTicks(scale);

  return (
    <section>
      <h2 className="text-lg mb-1">Cadence</h2>
      <p className="text-sm text-ink/70 mb-4 max-w-2xl">
        Observations per week and sessions per day, on one time axis. Two bands rather than two
        y-axes on one plot — they measure different things. Note where each series starts: sessions
        older than 90 days are archived off disk, so that record is shorter than the observation
        record, and any &ldquo;sessions over time&rdquo; number older than the cutoff is missing, not zero.
      </p>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${BAND * 2 + 56}`} className="min-w-[700px] w-full" role="img"
             aria-label="Observations per week and sessions per day over time">
          <g transform="translate(0,10)">
            <text x={0} y={-1} fontSize={11} fill={MUTED}>observations / week</text>
            <BarBand buckets={observationWeeks} scale={scale} color={BAND_INK}
                     height={BAND} barDays={7} unitLabel="observations" />
          </g>

          <g transform={`translate(0,${BAND + 40})`}>
            <text x={0} y={-1} fontSize={11} fill={MUTED}>sessions / day</text>
            <BarBand buckets={sessionDays} scale={scale} color={BAND_INK}
                     height={BAND} barDays={1} unitLabel="sessions" />
          </g>

          <g transform={`translate(0,${BAND * 2 + 44})`}>
            {ticks.map((t) => (
              <g key={t.label + t.x}>
                <line x1={t.x} y1={-4} x2={t.x} y2={0} stroke={GRID} strokeWidth={1} />
                <text x={t.x} y={10} fontSize={10} fill={MUTED} textAnchor="middle">{t.label}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </section>
  );
}
