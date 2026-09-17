import { content } from '../content';
import { Container } from './Container';
import { SignupForm } from './SignupForm';

export function UpgradeSection() {
  const { upgrade } = content;

  return (
    <section id="pricing" className="border-y border-line bg-sunk py-24">
      <Container className="grid grid-cols-1 gap-12 md:grid-cols-2">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
            {upgrade.eyebrow}
          </span>
          <h2 className="mt-3 font-display text-[clamp(28px,3vw,38px)] font-semibold leading-[1.1] tracking-[-0.028em] text-ink text-balance">
            {upgrade.headline}
          </h2>
          <p className="mt-5 max-w-[46ch] text-[17.5px] leading-relaxed text-muted">
            {upgrade.body}
          </p>
          <p className="mt-8 font-display text-2xl font-semibold tabular-nums text-accent">
            <span>{upgrade.priceMonthly}</span>{' '}
            <span className="font-normal text-faint">or</span>{' '}
            <span>{upgrade.priceYearly}</span>
          </p>
          <div className="mt-7">
            <SignupForm />
          </div>
        </div>
        <ul className="flex flex-col gap-3 border-l border-line pl-8">
          {upgrade.proFeatures.map((feature) => (
            <li key={feature} className="text-[16.5px] leading-relaxed text-muted">
              {feature}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
