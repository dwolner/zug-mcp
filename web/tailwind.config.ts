import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#EDE5D8',
        seasalt: '#B8C9C0',
        ink: '#22302B',
        jade: '#596D69',
        clay: '#B5603A',
        cornflower: '#7AA5BF',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
};

export default config;
