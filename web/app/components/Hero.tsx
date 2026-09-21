import { content } from '../content';
import { Container } from './Container';
import { CopyCommand } from './CopyCommand';
import { HeroTerminal } from './HeroTerminal';

export function Hero() {
  const { hero } = content;

  return (
    <section className="pb-20 pt-28">
      <Container className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="min-w-0">
        <p className="flex items-center gap-2.5 font-mono text-[11.5px] uppercase tracking-[0.16em] text-accent">
          <span className="hebrew text-[18px] normal-case leading-none tracking-[0.02em]">
            {hero.originMark}
          </span>
          <span aria-hidden="true">·</span>
          <span>{hero.originLine}</span>
        </p>
        <h1 className="mt-6 max-w-[15ch] font-display text-[clamp(44px,6.4vw,76px)] font-semibold leading-[1.03] tracking-[-0.035em] text-ink text-balance lg:max-w-[17ch] lg:text-[clamp(44px,4vw,56px)]">
          {hero.headlinePrefix}
          <span className="text-accent">{hero.headlineAccent}</span>
        </h1>
        <p className="mt-7 max-w-[46ch] text-[21px] leading-relaxed text-muted">{hero.subhead}</p>
        <div className="mt-11 flex max-w-full flex-col items-start gap-3.5 font-display">
          <CopyCommand
            command={hero.install.command}
            copyLabel={hero.install.copyLabel}
            copiedLabel={hero.install.copiedLabel}
          />
          {hero.ctas.map((cta) => (
            <a
              key={cta.label}
              href={cta.href}
              className="rounded-sm border border-line bg-surface px-6 py-3 text-[15.5px] font-medium text-ink transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {cta.label}
            </a>
          ))}
        </div>
        </div>

        <HeroTerminal />
      </Container>
    </section>
  );
}
