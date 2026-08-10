import { content } from '../content';
import { SignatureMoment } from './SignatureMoment';

export function Hero() {
  const { hero } = content;

  return (
    <section className="grid grid-cols-1 gap-12 px-6 py-20 md:grid-cols-2">
      <div>
        <p className="font-mono text-sm text-jade">{hero.originLine}</p>
        <h1 className="mt-4 font-display text-4xl font-semibold text-ink sm:text-5xl">
          {hero.headlinePrefix}
          <span className="text-clay">{hero.headlineAccent}</span>
        </h1>
        <p className="mt-4 text-lg text-jade">{hero.subhead}</p>
        <div className="mt-8 flex gap-4">
          {hero.ctas.map((cta, i) => (
            <a
              key={cta.label}
              href={cta.href}
              className={
                i === 0
                  ? 'bg-clay px-4 py-2 font-display text-[11px] uppercase tracking-[0.16em] text-cream hover:bg-ink'
                  : 'border-b border-jade font-display text-[11px] uppercase tracking-[0.16em] text-jade'
              }
            >
              {cta.label}
            </a>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-4 border-l border-jade/20 pl-6">
        {hero.sidebarCards.map((card) => (
          <div key={card.label} className="bg-seasalt p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-jade">{card.label}</p>
            <p className="mt-2 font-display text-sm text-ink">{card.body}</p>
          </div>
        ))}
        <SignatureMoment />
      </div>
    </section>
  );
}
