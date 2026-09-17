import type { Metadata } from 'next';
import { Instrument_Sans, Newsreader, JetBrains_Mono, Noto_Sans_Hebrew } from 'next/font/google';
import './globals.css';

const display = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

// Serif body against the grotesk display — the pair that carries the page.
const body = Newsreader({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

// The mono carries no Hebrew glyphs, so זוּג fell back to whatever the OS had.
const hebrew = Noto_Sans_Hebrew({
  subsets: ['hebrew'],
  variable: '--font-hebrew',
  display: 'swap',
});

export const metadata: Metadata = {
  // Placeholder domain until a real one is chosen — needed so Next resolves the
  // file-convention OG image URL to a public host instead of localhost.
  metadataBase: new URL(process.env.SITE_URL ?? 'https://zug.dev'),
  title: 'zug — AI that remembers how you think.',
  description: 'The fingerprint is earned, not configured.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${hebrew.variable}`}>
      <body className="bg-ground text-ink font-body">{children}</body>
    </html>
  );
}
