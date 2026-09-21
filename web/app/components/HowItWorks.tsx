import { content } from '../content';
import { Container } from './Container';
import { SectionHead } from './SectionHead';
import { SignatureMoment } from './SignatureMoment';
import { ContextFunnel } from './ContextFunnel';

export function HowItWorks() {
  const { howItWorks } = content;

  return (
    <section id="how-it-works" className="border-t border-line py-24">
      <SectionHead
        eyebrow={howItWorks.eyebrow}
        headline={howItWorks.headline}
        body={howItWorks.body}
      />

      <Container className="mt-16">
        <ol className="flex flex-col">
          {howItWorks.steps.map((step, i) => {
            const last = i === howItWorks.steps.length - 1;
            return (
              <li key={step.number} className="grid grid-cols-[auto_1fr] gap-x-7">
                {/* Gutter: number, then the rail that carries the eye to the next step. */}
                <div className="flex flex-col items-center">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-sunk font-mono text-[12px] tabular-nums text-accent">
                    {step.number}
                  </span>
                  {!last && <span aria-hidden="true" className="mt-2 w-px grow bg-line" />}
                </div>

                <div className={`min-w-0 ${last ? 'pb-0' : 'pb-12'}`}>
                  <h3 className="font-display text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-[58ch] text-[17.5px] text-muted">{step.body}</p>
                  {/* Step 03 is the one orchestrated motion moment (brand.md):
                      raw observations resolving into a synthesized line. */}
                  {step.number === '03' ? (
                    <div className="mt-5">
                      <SignatureMoment />
                    </div>
                  ) : (
                    <div className="mt-5 overflow-x-auto rounded-sm border border-line bg-surface">
                      <div className="min-w-[380px] px-5 py-4">
                        {step.sample.map((line, j) => (
                          <p
                            key={line}
                            className={`whitespace-pre font-mono text-[12.5px] leading-relaxed tabular-nums ${
                              j === 0 ? 'text-faint' : 'mt-1 text-accent'
                            }`}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <p className="mt-12 flex items-center gap-3 font-display text-[16.5px] text-muted">
          <span aria-hidden="true" className="font-mono text-accent">
            ↻
          </span>
          {howItWorks.loopNote}
        </p>
      </Container>

      <ContextFunnel />
    </section>
  );
}
