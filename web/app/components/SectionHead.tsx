import { Container } from './Container';

export function SectionHead({
  eyebrow,
  headline,
  body,
}: {
  eyebrow: string;
  headline: string;
  body?: string;
}) {
  return (
    <Container>
      <p className="font-mono text-[11.5px] uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
      <h2 className="mt-4 max-w-[20ch] font-display text-[clamp(30px,3.4vw,44px)] font-semibold leading-[1.08] tracking-[-0.03em] text-ink text-balance">
        {headline}
      </h2>
      {body ? <p className="mt-5 max-w-[62ch] text-[18.5px] text-muted">{body}</p> : null}
    </Container>
  );
}
