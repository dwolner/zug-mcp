import { content } from '../content';
import { Container } from './Container';

export function Hero() {
  const { hero } = content;

  return (
    <section className="pb-20 pt-28">
      <Container>
        <p className="flex items-center gap-2.5 font-mono text-[11.5px] uppercase tracking-[0.16em] text-accent">
          <span className="hebrew text-[18px] normal-case leading-none tracking-[0.02em]">
            {hero.originMark}
          </span>
          <span aria-hidden="true">·</span>
          <span>{hero.originLine}</span>
        </p>
        <h1 className="mt-6 max-w-[15ch] font-display text-[clamp(44px,6.4vw,76px)] font-semibold leading-[1.03] tracking-[-0.035em] text-ink text-balance">
          {hero.headlinePrefix}
          <span className="text-accent">{hero.headlineAccent}</span>
        </h1>
        <p className="mt-7 max-w-[46ch] text-[21px] leading-relaxed text-muted">{hero.subhead}</p>
        <div className="mt-11 flex flex-wrap items-center gap-3 font-display">
          {hero.ctas.map((cta, i) => (
            <a
              key={cta.label}
              href={cta.href}
              className={
                i === 0
                  ? 'rounded-sm bg-accent px-7 py-3.5 text-[16px] font-semibold text-ground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                  : 'rounded-sm px-4 py-3.5 text-[16px] font-medium text-muted transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
              }
            >
              {cta.label}
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}
