export function DataCard({
  label,
  lines,
  tone = 'neutral',
}: {
  label: string;
  lines: string[];
  tone?: 'neutral' | 'accent';
}) {
  return (
    <div className="overflow-hidden rounded-sm border border-line">
      <p
        className={`border-b border-line bg-sunk px-5 py-3 font-display text-[11px] font-semibold uppercase tracking-[0.14em] ${
          tone === 'accent' ? 'text-accent' : 'text-faint'
        }`}
      >
        {label}
      </p>
      <ul className="divide-y divide-line-soft bg-surface">
        {lines.map((line) => (
          <li
            key={line}
            className={`px-5 py-2.5 font-mono text-[12.5px] leading-relaxed tabular-nums ${
              tone === 'accent' ? 'text-muted' : 'text-faint'
            }`}
          >
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
