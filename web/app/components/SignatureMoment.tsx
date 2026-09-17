'use client';

import { useEffect, useRef, useState } from 'react';

const OBSERVATIONS = [
  '[2026·03] observed: prefers root-cause framing before solutions',
  '[2026·04] observed: tests the actual gate, not its description',
];

const SYNTHESIZED_LINE = 'You diagnose before you report. Lead me to the cause.';

export function SignatureMoment() {
  const [revealed, setRevealed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (query.matches) {
      setReducedMotion(true);
      setRevealed(true);
      return;
    }

    // Trigger on intersection, not on a load timer — the resolve is the whole
    // point, and a timer plays it to an empty room if the block is off-screen.
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setRevealed(true), 700);
          observer.disconnect();
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-testid="signature-moment"
      data-revealed={revealed}
      className="rounded-sm border border-accent/25 bg-sunk px-5 py-4"
    >
      <div className="font-mono text-[11px] leading-relaxed text-faint">
        {OBSERVATIONS.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <p
        data-testid="synthesized-line"
        className={`mt-3 font-display text-[19px] font-medium leading-snug tracking-[-0.015em] text-accent ${
          reducedMotion ? '' : 'transition-opacity duration-700'
        } ${revealed ? 'opacity-100' : 'opacity-0'}`}
      >
        {SYNTHESIZED_LINE}
      </p>
    </div>
  );
}
