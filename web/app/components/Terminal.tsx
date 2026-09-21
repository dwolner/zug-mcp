/**
 * Terminal chrome for the sample blocks. The contents are program output, not
 * commands, so there is deliberately no prompt glyph: a `$` would imply you run
 * these yourself, and you never do.
 */
export function Terminal({
  title = '~/.zug',
  accent = false,
  children,
}: {
  title?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-md border bg-ground ${
        accent ? 'border-accent/25' : 'border-line'
      }`}
    >
      <div
        className={`flex items-center gap-2.5 border-b px-3.5 py-2 ${
          accent ? 'border-accent/20 bg-accent/[0.05]' : 'border-line bg-sunk'
        }`}
      >
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
        </span>
        <span className="truncate font-mono text-[11px] tracking-[0.04em] text-faint">{title}</span>
      </div>

      {/* Scroll the body, never the chrome. min-w-0 so a wide child cannot
          widen the page from inside a grid item. */}
      <div className="min-w-0 overflow-x-auto">
        <div className="min-w-[380px] px-4 py-3.5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Sample lines. A line starting with "$ " renders as an invocation, anything
 * else as that command's output. The prompt is select-none so copying a block
 * gives you something you could actually paste.
 */
export function TerminalLines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, i) => {
        const command = line.startsWith('$ ');
        return (
          <p
            key={`${line}-${i}`}
            className={`whitespace-pre font-mono text-[12.5px] leading-relaxed tabular-nums ${
              i > 0 ? 'mt-0.5' : ''
            } ${command ? 'text-ink' : 'text-faint'}`}
          >
            {command ? (
              <>
                <span aria-hidden="true" className="select-none text-accent">
                  ${' '}
                </span>
                {line.slice(2)}
              </>
            ) : (
              line
            )}
          </p>
        );
      })}
    </>
  );
}
