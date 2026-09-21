import { content } from '../content';
import { Callout } from './Callout';
import { Container } from './Container';
import { SectionHead } from './SectionHead';

export function AgentStack() {
  const { agentStack } = content;
  const { columns, layers } = agentStack;

  return (
    <section id="what" className="border-t border-line py-24">
      <SectionHead
        eyebrow={agentStack.eyebrow}
        headline={agentStack.headline}
        body={agentStack.body}
      />

      <Container className="mt-14">
        {/* Phone: the judgment column is the whole argument, so restack rather
            than let a three-column table push it off-screen. */}
        <ul className="divide-y divide-line-soft rounded-sm border border-line bg-surface md:hidden">
          {layers.map((layer) => (
            <li
              key={layer.name}
              className={`px-5 py-4 ${layer.isZug ? 'bg-accent/[0.05]' : ''}`}
            >
              <p
                className={`font-display text-[15.5px] font-semibold ${
                  layer.isZug ? 'text-accent' : 'text-ink'
                }`}
              >
                {layer.name}
              </p>
              <p className="mt-1 text-[15.5px] leading-snug text-muted">{layer.carries}</p>
              <p className="mt-2.5 font-mono text-[12.5px] text-faint">
                {columns.judgmentShort}{' '}
                <span className={layer.isZug ? 'text-accent' : 'text-muted'}>{layer.judgment}</span>
              </p>
            </li>
          ))}
        </ul>

        <div className="hidden min-w-0 overflow-x-auto rounded-sm border border-line md:block">
          <table className="w-full min-w-[560px] border-collapse bg-surface text-left">
            <thead>
              <tr className="bg-sunk">
                {[columns.layer, columns.carries, columns.judgment].map((h) => (
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
              {layers.map((layer) => (
                <tr key={layer.name} className={layer.isZug ? 'bg-accent/[0.05]' : undefined}>
                  <th
                    scope="row"
                    className={`border-b border-line-soft px-5 py-4 align-top font-display text-[15.5px] font-semibold ${
                      layer.isZug ? 'text-accent' : 'text-ink'
                    }`}
                  >
                    {layer.name}
                  </th>
                  <td className="border-b border-line-soft px-5 py-4 align-top text-[15.5px] leading-snug text-muted">
                    {layer.carries}
                  </td>
                  <td
                    className={`border-b border-line-soft px-5 py-4 align-top font-mono text-[13px] ${
                      layer.isZug ? 'text-accent' : 'text-faint'
                    }`}
                  >
                    {layer.judgment}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12">
          <Callout label={agentStack.callout.label}>{agentStack.callout.body}</Callout>
        </div>

        <dl className="mt-12 grid grid-cols-1 gap-x-12 gap-y-4 border-t border-line pt-8 sm:grid-cols-2">
          {agentStack.spec.map((row) => (
            <div key={row.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-4">
              <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
                {row.label}
              </dt>
              <dd className="font-mono text-[13.5px] leading-snug text-muted">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
