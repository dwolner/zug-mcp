import { content } from '../content';
import { Container } from './Container';
import { CopyCommand } from './CopyCommand';
import { SectionHead } from './SectionHead';

/**
 * Items 8 and 2 of T-063 in one section rather than two. The ideal is the
 * emotional close, so it carries the restatement and the CTA instead of a
 * separate block repeating them.
 */
export function Closing() {
  const { closing, hero } = content;

  return (
    <section className="border-t border-line py-24">
      <SectionHead eyebrow={closing.eyebrow} headline={closing.headline} body={closing.body} />

      <Container className="mt-16 border-t border-line pt-14">
        <p className="max-w-[20ch] font-display text-[clamp(28px,3.2vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink text-balance">
          {closing.restatement}
        </p>
        <div className="mt-9 flex max-w-full flex-col items-start gap-3.5 font-display">
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
      </Container>
    </section>
  );
}
