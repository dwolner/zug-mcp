import type { PersonaSection } from '@/lib/zug-data';

/** The fingerprint itself, browsable. No chart -- this is text, and text wants to be read. */
export function PersonaBrowser({ sections }: { sections: PersonaSection[] }) {
  const total = sections.reduce((n, s) => n + s.bullets.length, 0);

  return (
    <section>
      <h2 className="text-lg mb-1">What it has learned</h2>
      <p className="text-sm text-ink/70 mb-4 max-w-2xl">
        {total} observations across {sections.length} sections of PERSONA.md. Citations are shown
        where a line carries one; many do not.
      </p>

      <div className="max-w-3xl space-y-1">
        {sections.map((section) => (
          <details key={section.heading} className="border border-ink/15 rounded-lg bg-white/40">
            <summary className="cursor-pointer px-4 py-2 text-sm flex justify-between gap-4">
              <span>{section.heading}</span>
              <span className="font-mono text-xs text-ink/50">{section.bullets.length}</span>
            </summary>
            <ul className="px-4 pb-3 space-y-2">
              {section.bullets.map((b, i) => (
                <li key={i} className="text-xs leading-relaxed text-ink/80">
                  {b.text}
                  {b.citation && (
                    <span className="ml-1 font-mono text-ink/45">
                      [{b.citation.date ?? b.citation.raw.slice(0, 40) + '…'}]
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
