import { SERIES, SERIES_COLOR, OTHER_COLOR, MUTED } from '@/lib/chart-palette';
import type { TypeBreakdown } from '@/lib/zug-metrics';

const RARE = new Set(['mistake', 'breakthrough']);

function Row({ item, max }: { item: TypeBreakdown; max: number }) {
  const color = SERIES_COLOR[item.type] ?? OTHER_COLOR;
  const confidences = Object.entries(item.byConfidence).sort((a, b) => b[1] - a[1]);
  return (
    <li className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 py-1">
      <span className="text-xs text-ink/80">{item.type.replace(/_/g, ' ')}</span>
      <span className="flex h-4 items-center gap-[2px]" aria-hidden>
        {confidences.map(([conf, n]) => (
          <span
            key={conf}
            title={`${n} ${conf} confidence`}
            className="h-4 rounded-sm first:rounded-l-sm"
            style={{
              width: `${(n / max) * 100}%`,
              background: color,
              opacity: conf === 'high' ? 1 : conf === 'medium' ? 0.55 : 0.3,
            }}
          />
        ))}
      </span>
      <span className="font-mono text-xs text-ink/70 text-right">{item.total}</span>
    </li>
  );
}

/**
 * Horizontal bars, categorical color by type in the fixed validated order. Segment opacity carries
 * confidence, which is ordinal within a type -- it is not a second categorical hue.
 *
 * mistake and breakthrough are split out rather than listed alongside a 54-count bar: at that scale
 * they render as slivers, and they are the highest-signal entries in the corpus.
 */
export function Accumulating({ breakdown }: { breakdown: TypeBreakdown[] }) {
  const common = breakdown.filter((b) => !RARE.has(b.type));
  const rare = breakdown.filter((b) => RARE.has(b.type));
  const max = breakdown.reduce((m, b) => Math.max(m, b.total), 0) || 1;
  const rareMax = rare.reduce((m, b) => Math.max(m, b.total), 0) || 1;

  return (
    <section>
      <h2 className="text-lg mb-1">What is accumulating</h2>
      <p className="text-sm text-ink/70 mb-4 max-w-2xl">
        Observations by type. Bar opacity is confidence — solid is high, faded is medium.
      </p>

      <ul className="max-w-2xl">
        {common.map((item) => <Row key={item.type} item={item} max={max} />)}
      </ul>

      {rare.length > 0 && (
        <div className="mt-5 max-w-2xl">
          <p className="text-xs uppercase tracking-wide text-ink/50 mb-1">
            Rare types, rescaled
          </p>
          <p className="text-xs text-ink/60 mb-2">
            Shown against their own maximum. Against the counts above they would be invisible, and
            these are the entries most worth reading.
          </p>
          <ul>
            {rare.map((item) => <Row key={item.type} item={item} max={rareMax} />)}
          </ul>
        </div>
      )}

      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
        {SERIES.filter((s) => breakdown.some((b) => b.type === s.key)).map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
