import { content } from '../content';
import { SignupForm } from './SignupForm';

export function UpgradeSection() {
  const { upgrade } = content;

  return (
    <section id="pricing" className="grid grid-cols-1 gap-8 border-t border-jade/20 bg-seasalt px-6 py-16 md:grid-cols-2">
      <div>
        <span className="font-mono text-xs uppercase tracking-widest text-jade">{upgrade.eyebrow}</span>
        <h2 className="mt-2 font-display text-3xl font-semibold text-ink">{upgrade.headline}</h2>
        <p className="mt-4 text-jade">{upgrade.body}</p>
        <p className="mt-6 font-display text-2xl text-clay">
          <span>{upgrade.priceMonthly}</span>{' '}
          <span className="text-jade">or</span>{' '}
          <span>{upgrade.priceYearly}</span>
        </p>
        <div className="mt-6">
          <SignupForm />
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {upgrade.proFeatures.map((feature) => (
          <li key={feature} className="text-sm text-ink">
            {feature}
          </li>
        ))}
      </ul>
    </section>
  );
}
