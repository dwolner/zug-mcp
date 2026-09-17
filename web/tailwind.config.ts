import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark instrument palette. The accent is Jade pushed up in lightness and
        // saturation — same hue family as the original earthy system, legible on
        // a near-black ground.
        ground: '#0E1518',
        surface: '#141D21',
        sunk: '#111A1D',
        ink: '#E9EFEF',
        muted: '#94A4A9',
        faint: '#6D7E83',
        line: '#243237',
        'line-soft': '#1C282C',
        accent: '#5FBFB2',
      },
      fontFamily: {
        sans: ['var(--font-display)', ...defaultTheme.fontFamily.sans],
        display: ['var(--font-display)'],
        body: ['var(--font-body)', ...defaultTheme.fontFamily.serif],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
};

export default config;
