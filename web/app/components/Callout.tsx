export function Callout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <aside className="rounded-sm border-l-2 border-accent bg-accent/[0.06] px-6 py-5">
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
        {label}
      </p>
      <p className="mt-2.5 max-w-[64ch] text-[17.5px] text-muted">{children}</p>
    </aside>
  );
}
