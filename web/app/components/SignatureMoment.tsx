'use client';

import { useEffect, useState } from 'react';

const OBSERVATIONS = [
  '[2026·03] observed: prefers root-cause framing before solutions',
  '[2026·04] observed: tests the actual gate, not its description',
];

const SYNTHESIZED_LINE = 'You diagnose before you report. Lead me to the cause.';

export function SignatureMoment() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (query.matches) {
      setRevealed(true);
      return;
    }

    const timer = setTimeout(() => setRevealed(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div data-testid="signature-moment" data-revealed={revealed} className="bg-seasalt p-4">
      <div className="font-mono text-xs text-jade">
        {OBSERVATIONS.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <p
        className={`mt-3 font-display text-lg transition-opacity duration-500 ${
          revealed ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="text-clay">{SYNTHESIZED_LINE}</span>
      </p>
    </div>
  );
}
