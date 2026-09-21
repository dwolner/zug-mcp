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
    install: { command: string; copyLabel: string; copiedLabel: string };
    session: { kind: "command" | "hook" | "call" | "output" | "prompt" | "text"; text: string }[];
    ctas: NavLink[];
  };
  agentStack: {
    eyebrow: string;
    headline: string;
    body: string;
    columns: {
      layer: string;
      carries: string;
      judgment: string;
      judgmentShort: string;
    };
    layers: {
      name: string;
      carries: string;
      judgment: string;
      isZug?: boolean;
    }[];
    callout: { label: string; body: string };
    spec: { label: string; value: string }[];
  };
  howItWorks: {
    eyebrow: string;
    headline: string;
    body: string;
    steps: Step[];
    funnel: {
      headline: string;
      body: string;
      tiers: {
        label: string;
        note: string;
        files: { name: string; size: string }[];
      }[];
      footnote: string;
    };
  };
  compound: { eyebrow: string; headline: string; body: string };
  workContext: {
    headline: string;
    body: string;
    knows: { label: string; value: string }[];
    without: string[];
    withZug: string[];
    callout: { label: string; body: string };
  };
  recaps: {
    headline: string;
    body: string;
    sources: { name: string; answers: string; misses: string }[];
    sample: { title: string; sections: { heading: string; line: string }[] };
  };
  superpower: {
    fanout: {
      headline: string;
      body: string;
      root: string;
      children: string[];
    };
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

const REPO_URL = "https://github.com/dwolner/zug-mcp";

export const content: Content = {
  nav: [
    { label: "Docs", href: `${REPO_URL}#readme` },
    { label: "GitHub", href: REPO_URL },
    { label: "Pricing", href: "#pricing" },
  ],
  hero: {
    originMark: "זוג",
    originLine: 'Hebrew for "pair"',
    headlinePrefix: "You explain yourself to the same AI ",
    headlineAccent: "every single session.",
    subhead:
      "Instead, Zug will watch how you work and hand the result to every agent you open. Earned while you work, not configured.",
    install: {
      command: "npm install -g zug-mcp && zug setup",
      copyLabel: "Copy install command",
      copiedLabel: "Copied",
    },
    // A real session, in the shape Claude Code actually prints it: hook lines
    // with the command they ran, "> " for what the human typed, tool calls as
    // calls, and their output indented underneath.
    session: [
      { kind: "command", text: "claude" },
      { kind: "hook", text: "SessionStart:startup [zug pull] completed" },
      { kind: "output", text: 'zug pull: {"status":"ok"}' },
      { kind: "prompt", text: "why is synthesis truncating?" },
      { kind: "call", text: "zug_get_context()" },
      { kind: "output", text: "267 sessions · 179 observations · 1.6 KB loaded" },
      { kind: "text", text: "src/synthesize.ts owns it. One model call per" },
      { kind: "text", text: "document, so the ceiling applies per document." },
      { kind: "call", text: "zug_save_observation()" },
      { kind: "output", text: "[cognitive_pattern/high] verifies claims against" },
      { kind: "output", text: "primary sources" },
      { kind: "hook", text: "PreCompact [zug compact] completed" },
      { kind: "output", text: 'zug compact: durability push → {"status":"ok"}' },
    ],
    ctas: [{ label: "View on GitHub →", href: REPO_URL }],
  },
  agentStack: {
    eyebrow: "What it is",
    headline: "You configured the agent. Zug gets to know you.",
    body: "Rules files, skills, hooks, MCP servers. You have spent months telling your agent how to behave, and none of it says a word about who it is behaving for. Zug is the layer that does, and it is the only part of your setup you never have to update.",
    columns: {
      layer: "Layer",
      carries: "What it carries",
      judgment: "Routes through the model's judgment?",
      // Repeated once per card on phones, where the full question is noise.
      judgmentShort: "Model's judgment",
    },
    layers: [
      {
        name: "Injected rules",
        carries: "Your standing instructions, prepended every session",
        judgment: "yes",
      },
      {
        name: "Skills",
        carries: "Capabilities, loaded when a task matches",
        judgment: "yes",
      },
      {
        name: "Hooks",
        carries: "Code the harness runs around every turn",
        judgment: "no",
        isZug: true,
      },
      {
        name: "System reminders",
        carries: "Mid-conversation nudges you never see",
        judgment: "yes",
      },
    ],
    callout: {
      label: "Why a hook and not a prompt",
      body: "Every other way to make an agent remember you is a polite request. A prompt, a rules file, a line in a system message. The model can skip all of those, and it does. A hook is code your harness runs whether the model feels like cooperating or not. That is the whole trick.",
    },
    spec: [
      { label: "Installs as", value: "An MCP server, plus three hooks on Claude Code" },
      { label: "Works with", value: "Claude Code. Cursor and Windsurf via MCP." },
      { label: "Lives in", value: "~/.zug, plain markdown, yours to delete" },
      { label: "Costs", value: "Nothing" },
    ],
  },
  howItWorks: {
    eyebrow: "How it works",
    headline: "Install it once, then forget it exists.",
    body: "No profile to fill out, no settings page. The loop runs while you work and the only part you ever see is the last one.",
    steps: [
      {
        number: "01",
        title: "Observe",
        body: "Zug watches how you work, not what you ship. You correct something, you cut scope, you kill an approach. One line, written down, never rewritten.",
        sample: [
          "$ zug tail 1",
          "[cognitive_pattern/high] separates direction",
          "checkpoints from verification duty",
        ],
      },
      {
        number: "02",
        title: "Record",
        body: "Seeing it once is a guess. Seeing it three times is a fact. Repeats get logged against the pattern they confirm, and the session gets its own dated recap.",
        sample: [
          "$ ls ~/.zug/sessions | tail -2",
          "2026-09-16-workflow-emulation.md",
          "2026-09-20-landing-copy.md",
        ],
      },
      {
        number: "03",
        title: "Synthesize",
        body: "Every so often Zug rereads the pile and rewrites your persona: who you are as a thinker, and how to work with you. Anything it has seen enough times becomes a standing instruction your agent follows without being asked.",
        sample: [
          "$ zug persona | head -3",
          "# Cognitive Fingerprint",
          "Thinks in systems and relationships, top-down from",
          "vision to implementation",
        ],
      },
      {
        number: "04",
        title: "Inject",
        body: "Your agent gets a short brief at the start of every session. Not the transcript, not the whole persona. The rest stays on disk, one question away, for when it actually needs it.",
        sample: [
          "$ wc -c ~/.zug/ACTIVE.md",
          "    1617 /Users/you/.zug/ACTIVE.md",
        ],
      },
      {
        number: "05",
        title: "Repeat",
        body: "Then back to step one, against a sharper baseline. That is the whole product.",
        sample: [
          "$ zug status | head -2",
          "Sessions: 268 | Last: 2026-09-21",
          "Observations: 180",
        ],
      },
    ],
    funnel: {
      headline: "It will not eat your context window.",
      body: "Almost none of this gets loaded. History piles up, synthesis boils it down, and only the short brief rides along into every session. Here is a real persona after 267 sessions.",
      tiers: [
        {
          label: "Accumulated",
          note: "Append only. It grows every session and nothing gets edited away.",
          files: [
            { name: "observations.jsonl", size: "113 KB" },
            { name: "reinforcements.jsonl", size: "5.7 KB" },
            { name: "sessions/", size: "267 files" },
          ],
        },
        {
          label: "Synthesized",
          note: "Rewritten from the raw log, then compacted. This tier can get smaller as it gets sharper.",
          files: [
            { name: "PERSONA.md", size: "30 KB" },
            { name: "PLAYBOOK.md", size: "18 KB" },
            { name: "lessons.jsonl", size: "2.0 KB" },
          ],
        },
        {
          label: "Injected",
          note: "Three to five patterns, rewritten every synthesis. This one never grows.",
          files: [{ name: "ACTIVE.md", size: "1.6 KB" }],
        },
      ],
      footnote:
        "Roughly 170 KB on disk, 1.6 KB of it loaded by default. The other 169 KB is indexed, and your agent pulls the exact piece it needs. Measured 2026-09-20.",
    },
  },
  compound: {
    eyebrow: "The compound effect",
    headline: "Sessions usually start from zero, by design.",
    body: "Sometimes that helps. Mostly it is just you explaining yourself again to the billion dollar AI machine.",
  },
  workContext: {
    headline: "It learns your system, not just your style.",
    body: "Your stack, which service owns which problem, and what you decided last time it broke. So when something breaks again, your agent does not open with fifteen greps and a request that you explain the architecture.",
    knows: [
      {
        label: "Your stack",
        value: "Languages, services, where it all deploys",
      },
      {
        label: "Your layout",
        value: "Which repo owns which part of the system",
      },
      {
        label: "Your decisions",
        value: "What you picked last time, and what you rejected",
      },
      {
        label: "Your open threads",
        value: "What is in flight and what is parked",
      },
    ],
    without: [
      "you: why is synthesis truncating?",
      'agent: grep -r "truncat" .',
      "agent: which file writes PERSONA?",
      "you: explains the pipeline. again.",
      'agent: grep -r "max_tokens" .',
      "… 13 more greps",
    ],
    withZug: [
      "you: why is synthesis truncating?",
      "agent: src/synthesize.ts owns it",
      "agent: checks MAX_OUTPUT_TOKENS, one call per doc",
      "agent: last time, output tracked corpus size",
      "you: answers the actual question",
    ],
    callout: {
      label: "Clues, not the whole file",
      body: "The brief carries pointers, not contents. Enough for your agent to know that something is known and where to go for it. When it wants the detail it asks. You get the benefit of the whole persona without paying for it in every prompt.",
    },
  },
  recaps: {
    headline: "Every session builds on the last one.",
    body: "Zug writes a recap of each session to disk. Git tells you what changed. Tickets tell you what was planned. Neither tells you why you picked this shape and threw the other one out, which is the part you need six weeks later when it comes up again.",
    sources: [
      {
        name: "Git history",
        answers: "What changed, and when.",
        misses: "Nothing about what you rejected, or why this shape won.",
      },
      {
        name: "Ticketing system",
        answers: "What was assigned, and whether it closed.",
        misses:
          "Written before the work. Rarely updated once reality intervenes.",
      },
      {
        name: "Zug recaps",
        answers:
          "The decisions, the discarded options, the reasoning behind the shape.",
        misses:
          "Replace either of the others. It supplies the why they both leave out.",
      },
    ],
    sample: {
      title: "sessions/2026-09-15-scope-resolution.md",
      sections: [
        { heading: "Summary", line: "What the session was actually about." },
        {
          heading: "Decisions",
          line: "What was chosen, and what was turned down.",
        },
        {
          heading: "Next Steps",
          line: "The thread you would otherwise have to rebuild.",
        },
        {
          heading: "Observations",
          line: "What Zug learned about you along the way.",
        },
      ],
    },
  },
  superpower: {
    fanout: {
      headline: "It goes wherever you spawn.",
      body: "Spawn a subagent and it starts blind. You are handing work to a stranger who happens to share your codebase. Your persona is one call away from any session, so the thing you delegate to can find out what you would have told it.",
      root: "your persona",
      children: ["main session", "subagent", "subagent", "subagent"],
    },
    callout: {
      label: "The actual claim",
      body: "Not that Zug remembers your conversations. Transcripts are cheap and nobody wants to reread them. Zug remembers the conclusions you and your agent already reached about how you work, and spends about 400 tokens putting them back in front of it.",
    },
  },
  features: [
    {
      number: "01",
      title: "Earned, not configured",
      body: "No profile. No settings page.",
    },
    {
      number: "02",
      title: "One identity, every agent",
      body: "Claude, Cursor, Windsurf, and anything else that speaks MCP.",
    },
    {
      number: "03",
      title: "Your data, always",
      body: "Plain files on disk. Read it, back it up, delete it.",
    },
    {
      number: "04",
      title: "Compounds over time",
      body: "The longer you use it, the less you explain.",
    },
  ],
  upgrade: {
    eyebrow: "Zug Pro",
    headline: "You have more than one computer.",
    body: "Local Zug is the whole product and it stays free. Pro is for the second laptop and the work machine: one persona everywhere, synthesis that runs on our servers instead of your battery, and a dashboard showing what Zug has actually worked out about you.",
    priceMonthly: "$5 / month",
    priceYearly: "$50 / year",
    proFeatures: [
      "Sync, so the same persona is on every machine",
      "A dashboard showing what Zug has worked out about you",
      "Synthesis on our servers, not your laptop",
      "claude.ai in the browser, via OAuth",
      "Cloud backup",
    ],
    signup: {
      placeholder: "you@example.com",
      buttonLabel: "Join the waitlist",
      successMessage: "You're on the list. We'll email you when Pro ships.",
      errorMessage: "Something went wrong. Try again in a moment.",
    },
  },
  footer: {
    mark: "זוג",
    tagline:
      'Hebrew for "pair." Because the best thinking happens with a partner.',
    links: [
      { label: "GitHub", href: REPO_URL },
      { label: "Docs", href: `${REPO_URL}#readme` },
      { label: "MIT License", href: `${REPO_URL}/blob/main/LICENSE` },
    ],
  },
};
