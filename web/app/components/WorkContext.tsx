import { content } from '../content';
import { BeatHead } from './BeatHead';
import { Callout } from './Callout';
import { Container } from './Container';

function Transcript({
  label,
  lines,
  tone,
}: {
  label: string;
  lines: string[];
  tone: 'neutral' | 'accent';
}) {
  const accent = tone === 'accent';
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-sm border ${accent ? 'border-accent/40' : 'border-line'}`}
    >
      <p
        className={`border-b px-5 py-3 font-display text-[11px] font-semibold uppercase tracking-[0.14em] ${
          accent ? 'border-accent/25 bg-accent/[0.07] text-accent' : 'border-line bg-sunk text-faint'
        }`}
      >
        {label}
      </p>
      <div className="overflow-x-auto bg-surface">
        <ul className="min-w-[340px] px-5 py-4">
          {lines.map((line, i) => (
            <li
              key={`${line}-${i}`}
              className={`whitespace-pre-wrap py-1 font-mono text-[12.5px] leading-relaxed ${
                accent ? 'text-muted' : 'text-faint'
              }`}
            >
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Beat one of the compound section: Zug knows the system, not just the style. */
export function WorkContextBlock() {
  const { workContext } = content;

  return (
    <Container>
      <BeatHead title={workContext.headline} body={workContext.body} />

      <dl className="mt-10 grid grid-cols-1 gap-x-12 gap-y-6 border-y border-line py-8 sm:grid-cols-2">
        {workContext.knows.map((item) => (
          <div key={item.label} className="grid grid-cols-[auto_1fr] gap-x-4">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <div>
              <dt className="font-display text-[16.5px] font-semibold text-ink">{item.label}</dt>
              <dd className="mt-1 text-[16.5px] text-muted">{item.value}</dd>
            </div>
          </div>
        ))}
      </dl>

      <p className="mt-12 font-display text-[16.5px] text-faint">The first thirty seconds:</p>
      <div className="mt-4 grid grid-cols-1 items-start gap-5 md:grid-cols-2">
        <Transcript label="Cold agent" lines={workContext.without} tone="neutral" />
        <Transcript label="With your persona" lines={workContext.withZug} tone="accent" />
      </div>

      <div className="mt-14">
        <Callout label={workContext.callout.label}>{workContext.callout.body}</Callout>
      </div>
    </Container>
  );
}
