'use client';

import { useEffect, useRef } from 'react';
import { content } from '../content';
import { Terminal } from './Terminal';

const STEP_MS = 150;

const TONE: Record<string, string> = {
  command: 'text-ink',
  hook: 'text-accent',
  tool: 'text-accent',
  output: 'pl-4 text-faint',
  you: 'text-ink',
  agent: 'text-muted',
};

/** The marker that precedes a line. Hooks and tools get a dot because they are
 *  the point: neither one was typed by the person in the transcript. */
function Marker({ kind }: { kind: string }) {
  if (kind === 'command') return <span className="select-none text-accent">$ </span>;
  if (kind === 'hook' || kind === 'tool')
    return <span className="select-none text-accent">● </span>;
  if (kind === 'you') return <span className="select-none text-faint">you: </span>;
  if (kind === 'agent') return <span className="select-none text-faint">agent: </span>;
  return null;
}

export function HeroTerminal() {
  const { session } = content.hero;
  const tilt = useRef<HTMLDivElement>(null);

  // Pointer parallax. A couple of degrees, enough to feel alive without the
  // decoration brand.md rules out. Skipped for coarse pointers and for anyone
  // who asked for reduced motion.
  useEffect(() => {
    const el = tilt.current;
    if (!el || typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let frame = 0;
    const onMove = (e: MouseEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(r.width, 1);
        const dy = (e.clientY - (r.top + r.height / 2)) / Math.max(r.height, 1);
        const clamp = (n: number) => Math.max(-1, Math.min(1, n));
        el.style.transform = `perspective(1000px) rotateY(${(clamp(dx) * 2.4).toFixed(2)}deg) rotateX(${(clamp(-dy) * 2.4).toFixed(2)}deg)`;
      });
    };
    const reset = () => {
      el.style.transform = '';
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', reset);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', reset);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={tilt} className="zug-tilt min-w-0" data-testid="hero-terminal">
      <Terminal title="claude · ~/zug">
        {session.map((line, i) => (
          <p
            key={`${line.kind}-${i}`}
            className={`zug-line whitespace-pre font-mono text-[12.5px] leading-relaxed ${
              i > 0 ? 'mt-0.5' : ''
            } ${TONE[line.kind] ?? 'text-faint'}`}
            style={{ animationDelay: `${i * STEP_MS}ms` }}
          >
            <Marker kind={line.kind} />
            {line.text}
          </p>
        ))}
      </Terminal>
    </div>
  );
}
