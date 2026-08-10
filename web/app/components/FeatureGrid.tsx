import { content } from '../content';

export function FeatureGrid() {
  return (
    <section className="grid grid-cols-1 gap-8 border-t border-jade/20 px-6 py-16 sm:grid-cols-2 md:grid-cols-4">
      {content.features.map((feature) => (
        <div key={feature.number}>
          <span className="font-mono text-xs text-jade">{feature.number}</span>
          <h3 className="mt-2 font-display text-lg font-semibold text-ink">{feature.title}</h3>
          <p className="mt-2 text-sm text-jade">{feature.body}</p>
        </div>
      ))}
    </section>
  );
}
