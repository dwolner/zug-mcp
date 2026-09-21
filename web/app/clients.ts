/**
 * The one capability matrix. The README table and the landing page spec block
 * are both generated from this, because hand-copied facts in this repo have
 * gone stale twice (the page title and the OG image each shipped a headline
 * the page had already abandoned).
 *
 * Regenerate the README after editing:  npm run sync:readme
 *
 * `hooks` is the load-bearing column. A hook is code the harness runs whether
 * the model cooperates or not, so it is what makes the persona show up without
 * being asked. Note that no client guarantees *capture*: writing an observation
 * is always a zug_save_observation tool call, prompted by a rules file at best.
 */

export type ClientStatus = 'supported' | 'manual' | 'planned';

export interface AgentClient {
  name: string;
  status: ClientStatus;
  /** Where `zug setup` writes the MCP entry, or how it is configured by hand. */
  mcp: string;
  /** Lifecycle hooks Zug registers, or null where the harness has none or Zug has not wired them. */
  hooks: string | null;
  /** A file the harness loads unconditionally, telling the agent to call Zug. */
  rules: string | null;
  note?: string;
}

export const clients: AgentClient[] = [
  {
    name: 'Claude Code',
    status: 'supported',
    mcp: '~/.claude.json',
    hooks: '~/.claude/settings.json',
    rules: '~/.claude/rules/zug.md',
    note: 'SessionStart pulls, SessionEnd pushes, PreCompact checkpoints.',
  },
  {
    name: 'Cursor',
    status: 'supported',
    mcp: '~/.cursor/mcp.json',
    hooks: null,
    rules: null,
    note: 'The IDE. cursor-agent, the CLI, is a separate surface Zug has not looked at.',
  },
  {
    name: 'Windsurf',
    status: 'supported',
    mcp: '~/.codeium/windsurf/mcp_config.json',
    hooks: null,
    rules: null,
  },
  {
    name: 'Devin CLI',
    status: 'manual',
    mcp: 'hand-written MCP entry',
    hooks: null,
    rules: null,
    note: 'In daily production use. Model-agnostic, so this is also how Zug already works with GPT.',
  },
  {
    name: 'Codex CLI',
    status: 'planned',
    mcp: '~/.codex/config.toml, [mcp_servers]',
    hooks: '~/.codex/hooks.json',
    rules: null,
    note: 'Has SessionStart and Stop hooks in a near-identical shape to Claude Code. Closest to full parity.',
  },
  {
    name: 'OpenCode',
    status: 'planned',
    mcp: 'unverified',
    hooks: null,
    rules: null,
  },
  {
    name: 'Grok CLI',
    status: 'planned',
    mcp: 'unverified',
    hooks: null,
    rules: null,
  },
  {
    name: 'Antigravity',
    status: 'planned',
    mcp: 'unverified',
    hooks: null,
    rules: null,
  },
];

/** Clients where the persona loads without the agent choosing to fetch it. */
export const hookedClients = clients.filter((c) => c.status === 'supported' && c.hooks);

/** The spec line on the landing page, derived so it cannot drift from the table. */
export const worksWith = `Anything that speaks MCP. Hooks on ${hookedClients
  .map((c) => c.name)
  .join(', ')}.`;
