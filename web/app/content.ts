export interface NavLink {
  label: string;
  href: string;
}

export interface Content {
  nav: NavLink[];
  hero: {
    originLine: string;
    headlinePrefix: string;
    headlineAccent: string;
    subhead: string;
    ctas: NavLink[];
    sidebarCards: { label: string; body: string }[];
  };
  features: { number: string; title: string; body: string }[];
  upgrade: {
    eyebrow: string;
    headline: string;
    body: string;
    priceMonthly: string;
    priceYearly: string;
    proFeatures: string[];
    signup: {
      placeholder: string;
      buttonLabel: string;
      successMessage: string;
      errorMessage: string;
    };
  };
  footer: { tagline: string; links: NavLink[] };
}

const REPO_URL = 'https://github.com/dwolner/zug-mcp';

export const content: Content = {
  nav: [
    { label: 'Docs', href: `${REPO_URL}#readme` },
    { label: 'GitHub', href: REPO_URL },
    { label: 'Pricing', href: '#pricing' },
  ],
  hero: {
    originLine: 'זוּג · Hebrew for "pair"',
    headlinePrefix: 'AI that remembers ',
    headlineAccent: 'how you think.',
    subhead: 'The fingerprint is earned, not configured.',
    ctas: [
      { label: 'Install Free', href: `${REPO_URL}#readme` },
      { label: 'View on GitHub →', href: REPO_URL },
    ],
    sidebarCards: [
      {
        label: 'Cognitive fingerprint',
        body: 'Not a profile you fill out. A pattern Zug learns by watching how you actually work.',
      },
      {
        label: 'Cross-agent sync',
        body: 'Claude, Cursor, Windsurf — your fingerprint follows you into every session, every tool.',
      },
      {
        label: 'Your data',
        body: 'Plain files on disk. No database, no lock-in. Yours to read, back up, or delete.',
      },
    ],
  },
  features: [
    {
      number: '01',
      title: 'Earned, not configured',
      body: 'No profile to fill out. Zug watches how you work, synthesizes what it learns, and builds your fingerprint session by session.',
    },
    {
      number: '02',
      title: 'One identity, every agent',
      body: 'Claude, Cursor, Windsurf. Your fingerprint follows you across every tool you work in — automatically.',
    },
    {
      number: '03',
      title: 'Your data, always',
      body: 'Plain files. No database, no lock-in. Read it, back it up, delete it. It belongs to you.',
    },
    {
      number: '04',
      title: 'Compounds over time',
      body: 'Every session, Zug synthesizes new observations. The longer you use it, the less you have to explain yourself.',
    },
  ],
  upgrade: {
    eyebrow: 'Zug Pro',
    headline: 'Your fingerprint is now infrastructure.',
    body: "After 50 sessions, what you've built is worth protecting. Pro makes it permanent, portable, and always with you.",
    priceMonthly: '$5 / month',
    priceYearly: '$50 / year',
    proFeatures: [
      'Remote sync (fingerprint on every machine, always current)',
      'claude.ai web support via OAuth',
      'Server-side synthesis (runs on our infra, not yours)',
      'Persistent cloud backup',
      'Priority support',
    ],
    signup: {
      placeholder: 'you@example.com',
      buttonLabel: 'Join the waitlist',
      successMessage: "You're on the list — we'll email you when Pro ships.",
      errorMessage: 'Something went wrong — try again in a moment.',
    },
  },
  footer: {
    tagline: 'זוּג · Hebrew for "pair." Because the best thinking happens with a partner.',
    links: [
      { label: 'GitHub', href: REPO_URL },
      { label: 'Docs', href: `${REPO_URL}#readme` },
      { label: 'MIT License', href: `${REPO_URL}/blob/main/LICENSE` },
    ],
  },
};
