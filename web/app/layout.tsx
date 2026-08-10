import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
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
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="bg-cream text-ink font-sans">{children}</body>
    </html>
  );
}
