import { content } from '../content';
import { BeatHead } from './BeatHead';
import { Callout } from './Callout';
import { Container } from './Container';

function FanOut({ root, leaves }: { root: string; leaves: string[] }) {
  // Four leaves, evenly spaced across the 480-unit viewBox.
  const leafX = leaves.map((_, i) => 60 + i * 120);
  const barLeft = Math.min(240, ...leafX);
  const barRight = Math.max(240, ...leafX);
  const caption = `One persona feeding ${leaves.join(', ')}`;

  return (
    // min-w-0: as a grid item this would otherwise inherit the svg's 520px
    // min-width as its own floor and push the page wider than the viewport.
    <div className="min-w-0">
      {/* Phone: side-scrolling the svg shows half a diagram, which argues
          nothing. Below md the same relationship is drawn with boxes. */}
      <div className="md:hidden" role="img" aria-label={caption}>
        <p className="rounded-sm border border-accent/60 bg-[#111A1D] px-4 py-2.5 text-center font-mono text-[13px] text-accent">
          {root}
        </p>
        <span aria-hidden="true" className="mx-auto block h-5 w-px bg-line" />
        <ul className="grid grid-cols-2 gap-2.5">
          {leaves.map((label, i) => (
            <li
              key={`${label}-${i}`}
              className="rounded-sm border border-line bg-[#141D21] px-3 py-2.5 text-center"
            >
              <span className="block font-mono text-[12px] text-muted">{label}</span>
              <span className="mt-1 block font-mono text-[11px] text-accent">knows you</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Still scrollable at md, where the 1.15fr column is narrower than 520px. */}
      <div className="hidden min-w-0 overflow-x-auto md:block">
        <svg
          viewBox="0 0 480 176"
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label={caption}
        >
          {/* One trunk, one bar, one drop per leaf. Drawing a full elbow per leaf
              overlapped the shared horizontal run and left visible seams in it. */}
          <g fill="none" stroke="#243237" strokeWidth="1">
            <path d="M240 46 V 82" />
            <path d={`M${barLeft} 82 H ${barRight}`} />
            {leafX.map((x) => (
              <path key={x} d={`M${x} 82 V 110`} />
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
    </div>
  );
}

/** Beat three of the compound section: the persona reaches whatever you spawn. */
export function FanOutBlock() {
  const { superpower } = content;

  return (
    <Container>
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[0.85fr_1.15fr]">
        <div>
          <BeatHead title={superpower.fanout.headline} body={superpower.fanout.body} />
        </div>
        <FanOut root={superpower.fanout.root} leaves={superpower.fanout.children} />
      </div>

      <div className="mt-16">
        <Callout label={superpower.callout.label}>{superpower.callout.body}</Callout>
      </div>
    </Container>
  );
}
