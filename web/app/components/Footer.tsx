import { content } from '../content';
import { Container } from './Container';

export function Footer() {
  return (
    <footer className="border-t border-line py-10">
      <Container className="flex flex-col items-start justify-between gap-5 font-display text-[13.5px] sm:flex-row sm:items-center">
        <p className="flex items-center gap-2 text-faint">
          <span className="hebrew text-[17px] leading-none tracking-[0.02em]">
            {content.footer.mark}
          </span>
          <span aria-hidden="true">·</span>
          <span>{content.footer.tagline}</span>
        </p>
        <ul className="flex gap-6">
          {content.footer.links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className="text-faint transition-colors hover:text-accent focus-visible:text-accent"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </footer>
  );
}
