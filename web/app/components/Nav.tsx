import { content } from '../content';

export function Nav() {
  return (
    <nav className="flex items-center justify-between border-b border-jade/20 px-6 py-4">
      <span className="font-mono text-sm text-jade">זוּג</span>
      <ul className="flex flex-wrap gap-4 sm:gap-6">
        {content.nav.map((link) => (
          <li key={link.label}>
            <a href={link.href} className="text-sm text-jade hover:text-clay">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
