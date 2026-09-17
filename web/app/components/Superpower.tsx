import { content } from '../content';
import { Callout } from './Callout';
import { Container } from './Container';
import { DataCard } from './DataCard';
import { SectionHead } from './SectionHead';

function FanOut({ root, leaves }: { root: string; leaves: string[] }) {
  // Four leaves, evenly spaced across a 600-unit viewBox.
  const leafX = leaves.map((_, i) => 60 + i * 120);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox="0 0 480 176"
        className="h-auto w-full min-w-[520px]"
        role="img"
        aria-label={`One fingerprint feeding ${leaves.join(', ')}`}
      >
        <g fill="none" stroke="#243237" strokeWidth="1">
          {leafX.map((x) => (
            <path key={x} d={`M240 46 V 82 H ${x} V 110`} />
          ))}
        </g>

        <rect x="152" y="16" width="176" height="30" rx="3" fill="#111A1D" stroke="#5FBFB2" />
        <text
          x="240"
          y="36"
          textAnchor="middle"
          fill="#5FBFB2"
          fontSize="14"
          fontFamily="var(--font-mono), monospace"
        >
          {root}
        </text>

        {leaves.map((label, i) => (
          <g key={`${label}-${i}`}>
            <rect
              x={leafX[i] - 52}
              y="110"
              width="104"
              height="30"
              rx="3"
              fill="#141D21"
              stroke="#243237"
            />
            <text
              x={leafX[i]}
              y="130"
              textAnchor="middle"
              fill="#94A4A9"
              fontSize="12.5"
              fontFamily="var(--font-mono), monospace"
            >
              {label}
            </text>
            <text
              x={leafX[i]}
              y="158"
              textAnchor="middle"
              fill="#5FBFB2"
              fontSize="11.5"
              fontFamily="var(--font-mono), monospace"
            >
              knows you
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function Superpower() {
  const { superpower } = content;

  return (
    <section id="why" className="border-t border-line bg-sunk/60 py-24">
      <SectionHead
        eyebrow={superpower.eyebrow}
        headline={superpower.headline}
        body={superpower.body}
      />

      <Container className="mt-14">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <DataCard label={superpower.without.label} lines={superpower.without.lines} />
          <DataCard label={superpower.withZug.label} lines={superpower.withZug.lines} tone="accent" />
        </div>

        <div className="mt-20 grid grid-cols-1 items-center gap-12 md:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h3 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink text-balance">
              {superpower.fanout.headline}
            </h3>
            <p className="mt-4 text-[17.5px] text-muted">{superpower.fanout.body}</p>
          </div>
          <FanOut root={superpower.fanout.root} leaves={superpower.fanout.children} />
        </div>

        <div className="mt-16">
          <Callout label={superpower.callout.label}>{superpower.callout.body}</Callout>
        </div>
      </Container>
    </section>
  );
}
