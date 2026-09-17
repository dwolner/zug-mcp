import { content } from '../content';
import { Container } from './Container';
import { SectionHead } from './SectionHead';

export function Recaps() {
  const { recaps } = content;

  return (
    <section id="recaps" className="border-t border-line bg-sunk/60 py-24">
      <SectionHead eyebrow={recaps.eyebrow} headline={recaps.headline} body={recaps.body} />

      <Container className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-x-auto rounded-sm border border-line">
          <table className="w-full min-w-[520px] border-collapse bg-surface text-left">
            <thead>
              <tr className="bg-sunk">
                {['Source', 'Answers', "Doesn't"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="border-b border-line px-5 py-3 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-faint"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recaps.sources.map((source, i) => {
                const isZug = i === recaps.sources.length - 1;
                return (
                  <tr key={source.name} className={isZug ? 'bg-accent/[0.05]' : undefined}>
                    <th
                      scope="row"
                      className={`border-b border-line-soft px-5 py-4 align-top font-display text-[15.5px] font-semibold ${
                        isZug ? 'text-accent' : 'text-ink'
                      }`}
                    >
                      {source.name}
                    </th>
                    <td className="border-b border-line-soft px-5 py-4 align-top text-[15.5px] leading-snug text-muted">
                      {source.answers}
                    </td>
                    <td className="border-b border-line-soft px-5 py-4 align-top text-[15.5px] leading-snug text-faint">
                      {source.misses}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-sm border border-line">
          <p className="truncate border-b border-line bg-sunk px-5 py-3 font-mono text-[12px] text-accent">
            {recaps.sample.title}
          </p>
          <ul className="divide-y divide-line-soft bg-surface">
            {recaps.sample.sections.map((section) => (
              <li key={section.heading} className="px-5 py-3.5">
                <p className="font-mono text-[12.5px] text-muted">## {section.heading}</p>
                <p className="mt-1 text-[15px] leading-snug text-faint">{section.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
