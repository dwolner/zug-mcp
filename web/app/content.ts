export interface NavLink {
  label: string;
  href: string;
}

export interface Step {
  number: string;
  title: string;
  body: string;
  sample: string[];
}

export interface Content {
  nav: NavLink[];
  hero: {
    originMark: string;
    originLine: string;
    headlinePrefix: string;
    headlineAccent: string;
    subhead: string;
    ctas: NavLink[];
  };
  agentStack: {
    eyebrow: string;
    headline: string;
    body: string;
    columns: { layer: string; carries: string; judgment: string; judgmentShort: string };
    layers: { name: string; carries: string; judgment: string; isZug?: boolean }[];
    callout: { label: string; body: string };
    spec: { label: string; value: string }[];
  };
  howItWorks: {
    eyebrow: string;
    headline: string;
    body: string;
    steps: Step[];
    loopNote: string;
    funnel: {
      headline: string;
      body: string;
      tiers: { label: string; note: string; files: { name: string; size: string }[] }[];
      footnote: string;
    };
  };
  workContext: {
    eyebrow: string;
    headline: string;
    body: string;
    knows: { label: string; value: string }[];
    without: string[];
    withZug: string[];
    callout: { label: string; body: string };
  };
  recaps: {
    eyebrow: string;
    headline: string;
    body: string;
    sources: { name: string; answers: string; misses: string }[];
    sample: { title: string; sections: { heading: string; line: string }[] };
  };
  superpower: {
    eyebrow: string;
    headline: string;
    body: string;
    without: { label: string; lines: string[] };
    withZug: { label: string; lines: string[] };
    fanout: { headline: string; body: string; root: string; children: string[] };
    callout: { label: string; body: string };
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
  footer: { mark: string; tagline: string; links: NavLink[] };
}

const REPO_URL = 'https://github.com/dwolner/zug-mcp';

export const content: Content = {
  nav: [
    { label: 'Docs', href: `${REPO_URL}#readme` },
    { label: 'GitHub', href: REPO_URL },
    { label: 'Pricing', href: '#pricing' },
  ],
  hero: {
    originMark: 'זוג',
    originLine: 'Hebrew for "pair"',
    headlinePrefix: 'Every agent already knows ',
    headlineAccent: 'how you work.',
    subhead: 'Earned, not configured. Every session builds on the last.',
    ctas: [
      { label: 'Install Free', href: `${REPO_URL}#readme` },
      { label: 'View on GitHub →', href: REPO_URL },
    ],
  },
  agentStack: {
    eyebrow: 'What it is',
    headline: 'You already wrote an operating system for your agent.',
    body: 'Rules files tell it how to behave. Skills give it capabilities. Hooks run real code around every turn. You assembled all of it, layer by layer, and every layer configures the agent. None of them carry you.',
    columns: {
      layer: 'Layer',
      carries: 'What it carries',
      judgment: "Routes through the model's judgment?",
      // Repeated once per card on phones, where the full question is noise.
      judgmentShort: "Model's judgment",
    },
    layers: [
      {
        name: 'Injected rules',
        carries: 'Your standing instructions, prepended every session',
        judgment: 'yes',
      },
      { name: 'Skills', carries: 'Capabilities, loaded when a task matches', judgment: 'yes' },
      {
        name: 'Hooks',
        carries: 'Code the harness runs around every turn',
        judgment: 'no',
        isZug: true,
      },
      {
        name: 'System reminders',
        carries: 'Mid-conversation nudges you never see',
        judgment: 'yes',
      },
    ],
    callout: {
      label: 'Why this one is different',
      body: "Every other way to make an agent remember you is an instruction — a prompt, a rules file, a system message asking it to. All of those route through the model's judgment, and it can deprioritise them or reason its way past them. Zug writes through the hook, which is code the harness runs whether the agent cooperates or not. Observation is not something it can skip, and MCP makes what was written readable from any session, including every subagent.",
    },
    spec: [
      { label: 'Installs as', value: 'An MCP server and two hooks' },
      { label: 'Works with', value: 'Claude Code, Cursor, Windsurf' },
      { label: 'Lives in', value: '~/.zug — plain markdown, yours, deletable' },
      { label: 'Costs', value: 'Nothing' },
    ],
  },
  howItWorks: {
    eyebrow: 'How it works',
    headline: 'You do none of this.',
    body: 'There is no profile to fill out and no settings page. The loop runs while you work, and the only part you ever see is the last one.',
    steps: [
      {
        number: '01',
        title: 'Observe',
        body: 'Zug watches the session for how you reason — not the code you shipped, the move you made. A correction, a scope call, a question you asked before anyone else would have. Each one is appended to observations.jsonl, one line, never rewritten.',
        sample: [
          'observations.jsonl                                    +1 line',
          'observed: separates direction checkpoints from verification duty',
        ],
      },
      {
        number: '02',
        title: 'Record',
        body: 'Seeing the same thing twice is not a new fact, it is evidence. Repeats land in reinforcements.jsonl against the pattern they confirm, and the session itself is written to sessions/ as a dated recap.',
        sample: [
          'reinforcements.jsonl          pattern confirmed  ×3',
          'sessions/2026-09-16-workflow-emulation.md         written',
        ],
      },
      {
        number: '03',
        title: 'Synthesize',
        body: 'Periodically Zug rereads the raw log and rewrites the persona: PERSONA.md, who you are as a thinker, and PLAYBOOK.md, how to work with you. A pattern reinforced often enough is promoted into lessons.jsonl — a standing instruction your agent follows without being told.',
        sample: [
          'PERSONA.md · PLAYBOOK.md                      rewritten',
          'L-8483ea-1  Diagnose from the live system, never a local mirror',
        ],
      },
      {
        number: '04',
        title: 'Inject',
        body: 'Only ACTIVE.md is injected — a short brief of the patterns that matter right now. Not the transcript, not the whole persona. Everything deeper stays on disk and is one question away when the agent actually needs it.',
        sample: [
          'ACTIVE.md         1.6 KB        injected at session start',
          'PERSONA.md · PLAYBOOK.md · 267 recaps      on request only',
        ],
      },
    ],
    loopNote: 'Then step 01 again, against a sharper baseline. That is the whole product.',
    funnel: {
      headline: 'It compresses, then it holds the rest back.',
      body: 'The reason this does not eat your context window is that almost none of it is injected. Raw history accumulates, synthesis compresses it, and only the short brief rides along into every session. Below is a real persona after 267 sessions.',
      tiers: [
        {
          label: 'Accumulated',
          note: 'Append-only, and it grows with every session. Never edited, never summarised away.',
          files: [
            { name: 'observations.jsonl', size: '113 KB' },
            { name: 'reinforcements.jsonl', size: '5.7 KB' },
            { name: 'sessions/', size: '267 files' },
          ],
        },
        {
          label: 'Synthesized',
          note: 'Rewritten from the raw log, then compacted — this tier gets smaller as it gets sharper.',
          files: [
            { name: 'PERSONA.md', size: '30 KB' },
            { name: 'PLAYBOOK.md', size: '18 KB' },
            { name: 'lessons.jsonl', size: '2.0 KB' },
          ],
        },
        {
          label: 'Injected',
          note: 'Three to five patterns, rewritten every synthesis. This tier does not grow.',
          files: [{ name: 'ACTIVE.md', size: '1.6 KB' }],
        },
      ],
      footnote: 'Roughly 170 KB of accumulated context, 1.6 KB of it loaded by default. The other 169 KB is not gone — it is indexed, and the agent can pull the exact piece it needs. Measured 2026-09-20.',
    },
  },
  workContext: {
    eyebrow: 'Not just how you think',
    headline: 'It knows the shape of what you work on.',
    body: 'A persona is not only style. Over enough sessions Zug learns your company, your role, your stack, and which part of the system owns which problem — so a question about a broken thing does not start with fifteen greps and a request for you to explain the architecture again.',
    knows: [
      { label: 'Who you are', value: 'Role, team, what you are accountable for' },
      { label: 'What you run', value: 'Stack, infrastructure, deploy targets' },
      { label: 'How it is laid out', value: 'Which repo owns which part of the system' },
      { label: 'What you are mid-way through', value: 'Open threads, current phase, what is parked' },
    ],
    without: [
      'you: why is synthesis truncating?',
      'agent: grep -r "truncat" .',
      'agent: which file writes PERSONA?',
      'you: explains the pipeline. again.',
      'agent: grep -r "max_tokens" .',
      '… 13 more greps',
    ],
    withZug: [
      'you: why is synthesis truncating?',
      'agent: src/synthesize.ts owns it',
      'agent: checks MAX_OUTPUT_TOKENS, one call per doc',
      'agent: last time, output tracked corpus size',
      'you: answers the actual question',
    ],
    callout: {
      label: 'Clues, not the whole file',
      body: 'ACTIVE.md carries pointers, not contents — enough for the agent to know that something is known and where to find it. When it needs the detail it asks for the specific memory. You get the benefit of the whole persona without paying for it in every prompt.',
    },
  },
  recaps: {
    eyebrow: 'A second use',
    headline: 'Proof of what you actually did.',
    body: 'Zug writes a recap of every session to disk. That turns out to be useful for something other than the agent: it is a record of your work that neither your commit history nor your ticket queue can produce on its own.',
    sources: [
      {
        name: 'Git history',
        answers: 'What changed, and when.',
        misses: 'Nothing about what you rejected, or why this shape won.',
      },
      {
        name: 'Ticketing system',
        answers: 'What was assigned, and whether it closed.',
        misses: 'Written before the work. Rarely updated once reality intervenes.',
      },
      {
        name: 'Zug recaps',
        answers: 'The decisions, the discarded options, the reasoning behind the shape.',
        misses: 'Replace either of the others. It supplies the why they both leave out.',
      },
    ],
    sample: {
      title: 'sessions/2026-09-15-scope-resolution.md',
      sections: [
        { heading: 'Summary', line: 'What the session was actually about.' },
        { heading: 'Decisions', line: 'What was chosen, and what was turned down.' },
        { heading: 'Next Steps', line: 'The thread you would otherwise have to rebuild.' },
        { heading: 'Observations', line: 'What Zug learned about you along the way.' },
      ],
    },
  },
  superpower: {
    eyebrow: 'The compound effect',
    headline: 'The tax you stop paying.',
    body: 'Re-explaining yourself is a tax you pay per session. Most people never notice it, because it is spread thin — two minutes here, a wrong assumption corrected there, the same preference stated for the ninth time.',
    without: {
      label: 'Without Zug',
      lines: [
        'Session 1    you explain how you like to work',
        'Session 2    you explain it again',
        'Session 3    agent guesses wrong, you correct it',
        'Session 4    you explain it again',
        'Subagent A   knows nothing, starts from zero',
        'Subagent B   knows nothing, starts from zero',
      ],
    },
    withZug: {
      label: 'With Zug',
      lines: [
        'Session 1    you explain how you like to work',
        'Session 2    already loaded',
        'Session 3    already loaded, plus what it learned in 2',
        'Session 4    already loaded, sharper',
        'Subagent A   inherits the same persona',
        'Subagent B   inherits the same persona',
      ],
    },
    fanout: {
      headline: 'It survives the fan-out.',
      body: 'This is the part that is hard to get any other way. When you spawn subagents, each one normally starts blind — you are delegating to a stranger who happens to share your codebase. They inherit your persona instead, so the agent you hand work to already knows what you would have told it.',
      root: 'your persona',
      children: ['main session', 'subagent', 'subagent', 'subagent'],
    },
    callout: {
      label: 'The actual claim',
      body: 'Not that Zug remembers your conversations — transcripts are cheap, and nobody wants to re-read them. Zug remembers the conclusions you and your agent already reached about how you work, and spends about 400 tokens putting them back in front of it.',
    },
  },
  features: [
    { number: '01', title: 'Earned, not configured', body: 'No profile. No settings page.' },
    {
      number: '02',
      title: 'One identity, every agent',
      body: 'Claude, Cursor, Windsurf — and every subagent underneath them.',
    },
    {
      number: '03',
      title: 'Your data, always',
      body: 'Plain files on disk. Read it, back it up, delete it.',
    },
    {
      number: '04',
      title: 'Compounds over time',
      body: 'The longer you use it, the less you explain.',
    },
  ],
  upgrade: {
    eyebrow: 'Zug Pro',
    headline: 'Your persona is now infrastructure.',
    body: 'Local Zug is the whole product. It does not expire, nothing leaves your machine, and the files stay yours. Pro is for when one machine stops being enough.',
    priceMonthly: '$5 / month',
    priceYearly: '$50 / year',
    proFeatures: [
      'Remote sync (every machine, always current)',
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
    mark: 'זוג',
    tagline: 'Hebrew for "pair." Because the best thinking happens with a partner.',
    links: [
      { label: 'GitHub', href: REPO_URL },
      { label: 'Docs', href: `${REPO_URL}#readme` },
      { label: 'MIT License', href: `${REPO_URL}/blob/main/LICENSE` },
    ],
  },
};
