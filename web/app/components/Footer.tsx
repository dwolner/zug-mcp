import { content } from '../content';

export function Footer() {
  return (
    <footer className="flex flex-col items-start justify-between gap-4 border-t border-jade/20 px-6 py-8 sm:flex-row sm:items-center">
      <p className="font-mono text-sm text-jade">{content.footer.tagline}</p>
      <ul className="flex gap-6">
        {content.footer.links.map((link) => (
          <li key={link.label}>
            <a href={link.href} className="text-sm text-jade hover:text-clay">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}
