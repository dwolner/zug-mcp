/** Heading for a beat inside a section. One level down from SectionHead. */
export function BeatHead({ title, body }: { title: string; body?: string }) {
  return (
    <>
      <h3 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink text-balance">
        {title}
      </h3>
      {body ? <p className="mt-4 max-w-[62ch] text-[17.5px] text-muted">{body}</p> : null}
    </>
  );
}
