import { content } from '../content';
import { Container } from './Container';

export function ContextFunnel() {
  const { funnel } = content.howItWorks;

  return (
    <Container className="mt-20">
      <h3 className="max-w-[24ch] font-display text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink text-balance">
        {funnel.headline}
      </h3>
      <p className="mt-4 max-w-[62ch] text-[17.5px] text-muted">{funnel.body}</p>

      <ol className="mt-10 grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_auto_1fr_auto_0.8fr]">
        {funnel.tiers.map((tier, i) => {
          const injected = i === funnel.tiers.length - 1;
          return (
            <li key={tier.label} className="contents">
              <div
                className={`overflow-hidden rounded-sm border ${
                  injected ? 'border-accent/50' : 'border-line'
                }`}
              >
                <p
                  className={`flex items-baseline justify-between gap-3 border-b px-5 py-3 font-display text-[11px] font-semibold uppercase tracking-[0.14em] ${
                    injected
                      ? 'border-accent/30 bg-accent/[0.07] text-accent'
                      : 'border-line bg-sunk text-faint'
                  }`}
                >
                  {tier.label}
                </p>
                <ul className="divide-y divide-line-soft bg-surface">
                  {tier.files.map((file) => (
                    <li
                      key={file.name}
                      className="flex items-baseline justify-between gap-4 px-5 py-2.5"
                    >
                      <span
                        className={`font-mono text-[12.5px] ${
                          injected ? 'text-accent' : 'text-muted'
                        }`}
                      >
                        {file.name}
                      </span>
                      <span className="shrink-0 font-mono text-[12px] tabular-nums text-faint">
                        {file.size}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-line-soft bg-sunk px-5 py-3 text-[14px] leading-snug text-faint">
                  {tier.note}
                </p>
              </div>

              {i < funnel.tiers.length - 1 && (
                <span
                  aria-hidden="true"
                  className="hidden self-center font-mono text-[18px] text-faint md:block"
                >
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-6 max-w-[70ch] font-mono text-[13px] leading-relaxed text-faint">
        {funnel.footnote}
      </p>
    </Container>
  );
}
