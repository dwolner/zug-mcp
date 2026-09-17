import { content } from '../content';
import { Container } from './Container';

export function Nav() {
  return (
    <nav className="py-6">
      <Container className="flex items-center justify-between">
        <span className="font-display text-lg font-semibold tracking-[0.2em] text-ink">ZUG</span>
        <ul className="flex flex-wrap gap-6 font-display sm:gap-8">
          {content.nav.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className="text-[15px] text-muted transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none focus-visible:underline"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}
