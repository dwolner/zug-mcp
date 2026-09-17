import { content } from '../content';
import { Container } from './Container';

export function FeatureGrid() {
  return (
    <section className="border-t border-line py-20">
      <Container className="grid grid-cols-1 gap-x-14 gap-y-10 sm:grid-cols-2">
        {content.features.map((feature) => (
          <div key={feature.number} className="grid grid-cols-[auto_1fr] gap-x-5">
            <span className="pt-1 font-mono text-[12px] tabular-nums text-accent">
              {feature.number}
            </span>
            <div>
              <h3 className="font-display text-[19px] font-semibold tracking-[-0.018em] text-ink">
                {feature.title}
              </h3>
              <p className="mt-1.5 text-[17px] text-muted">{feature.body}</p>
            </div>
          </div>
        ))}
      </Container>
    </section>
  );
}
