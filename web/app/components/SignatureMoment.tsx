import { Terminal, TerminalLines } from './Terminal';

const OBSERVATIONS = [
  '$ zug tail 2',
  '[cognitive_pattern/high] prefers root-cause framing',
  '[cognitive_pattern/med] tests the actual gate, not its',
  'description',
];

const SYNTHESIZED_LINE = 'You diagnose before you report. Lead me to the cause.';

/**
 * Step 03: raw observations beside the line they resolve into.
 *
 * This used to reveal the synthesized line on scroll. docs/brand.md allows
 * exactly one orchestrated motion moment, and that is now the hero session,
 * so this renders statically. Two competing reveals is the over-animated feel
 * the brand doc rules out.
 */
export function SignatureMoment() {
  return (
    <div data-testid="signature-moment">
      <Terminal accent>
        <TerminalLines lines={OBSERVATIONS} />
        <p
          data-testid="synthesized-line"
          className="mt-3 font-display text-[19px] font-medium leading-snug tracking-[-0.015em] text-accent"
        >
          {SYNTHESIZED_LINE}
        </p>
      </Terminal>
    </div>
  );
}
