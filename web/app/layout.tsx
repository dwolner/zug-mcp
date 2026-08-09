import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'zug — AI that remembers how you think.',
  description: 'The fingerprint is earned, not configured.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
