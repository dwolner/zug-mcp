import { GRID, MUTED } from '@/lib/chart-palette';
import type { Bucket } from '@/lib/zug-metrics';

/**
 * A shared linear time scale. Cadence renders TWO charts against one of these rather than one
 * chart with two y-axes: observations/week and sessions/day are different measures, and a dual
 * y-axis is the single most misleading thing you can do to a reader. Small multiples on a shared
 * x-domain says the same thing honestly.
 */
export interface TimeScale {
  minMs: number;
  maxMs: number;
  width: number;
  x: (iso: string) => number;
  dayWidth: number;
}

export function makeTimeScale(allDates: string[], width: number): TimeScale | null {
  const times = allDates.map((d) => Date.parse(d)).filter((n) => !Number.isNaN(n));
  if (times.length === 0) return null;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const span = Math.max(maxMs - minMs, 86_400_000);
  return {
    minMs,
    maxMs,
    width,
    x: (iso: string) => ((Date.parse(iso) - minMs) / span) * width,
    dayWidth: (86_400_000 / span) * width,
  };
}

export function monthTicks(scale: TimeScale): { x: number; label: string }[] {
  const ticks: { x: number; label: string }[] = [];
  const start = new Date(scale.minMs);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor.getTime() <= scale.maxMs) {
    if (cursor.getTime() >= scale.minMs) {
      ticks.push({
        x: scale.x(cursor.toISOString()),
        label: cursor.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}

/**
 * One band of a small-multiple pair. Thin marks, 4px rounded data-ends anchored to the baseline,
 * recessive grid, a single direct label on the peak rather than a number on every bar.
 */
export function BarBand({
  buckets,
  scale,
  color,
  height,
  barDays,
  unitLabel,
}: {
  buckets: Bucket[];
  scale: TimeScale;
  color: string;
  height: number;
  barDays: number;
  unitLabel: string;
}) {
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  // 2px surface gap between adjacent fills.
  const barWidth = Math.max(2, scale.dayWidth * barDays - 2);
  const peak = buckets.reduce((p, b) => (b.count > p.count ? b : p), buckets[0]);

  return (
    <g>
      <line x1={0} y1={height} x2={scale.width} y2={height} stroke={GRID} strokeWidth={1} />
      {buckets.map((b) => {
        const h = Math.max(2, (b.count / max) * (height - 14));
        return (
          <rect
            key={b.date}
            x={scale.x(b.date)}
            y={height - h}
            width={barWidth}
            height={h}
            rx={2}
            fill={color}
          >
            <title>{`${b.date} — ${b.count} ${unitLabel}`}</title>
          </rect>
        );
      })}
      {peak && (
        <text
          x={Math.min(scale.x(peak.date) + barWidth + 4, scale.width - 28)}
          y={height - (peak.count / max) * (height - 14) + 9}
          fontSize={10}
          fill={MUTED}
          className="font-mono"
        >
          {peak.count}
        </text>
      )}
    </g>
  );
}
