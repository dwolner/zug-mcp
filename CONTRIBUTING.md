# Contributing to zug-mcp

## Getting Started

```bash
git clone https://github.com/your-username/zug-mcp
cd zug-mcp
pnpm install
```

Requires Node.js 20+ and pnpm.

## Running Locally

**MCP stdio server** (what Claude Code connects to):
```bash
pnpm dev
```

**CLI commands** (using tsx directly from source):
```bash
pnpm cli status
pnpm cli tail 20
pnpm cli setup
```

**HTTP transport** (advanced, for remote agents):
```bash
pnpm start:http
```

To test your local server with Claude Code, add it to your MCP config pointing at `tsx src/stdio.ts` instead of the global `zug-mcp` binary.

## Testing

```bash
pnpm test          # run all tests once
pnpm test:watch    # watch mode
pnpm typecheck     # TypeScript check only (no emit)
```

All behavior changes require tests. Tests use Vitest with a real temp directory — no mocks for file I/O. Keep tests co-located with their source files (`*.test.ts` next to `*.ts`).

## Building

```bash
pnpm build
```

Produces `dist/` from `src/`. The `dist/cli.js` and `dist/stdio.js` binaries are what npm installs globally.

## PR Guidelines

- **Focused PRs** — one logical change per PR. If you find a bug while adding a feature, fix it in a separate PR.
- **Tests required** — any change to behavior needs a test. If you're changing a data format or adding a tool, add a test for it.
- **Explain the why** — the PR description should explain the motivation, not just what changed. Link to an issue if one exists.
- **Keep the data format stable** — the JSONL files and JSON files in `~/.zug/` are append-only or in-place updates. No schema migrations. Any new field must be optional and backward-compatible.

## Data Format

All persistence is plain files in `~/.zug/`:

- **JSONL** (`observations.jsonl`, `growth.jsonl`, `sessions/*.jsonl`) — append-only. New records are appended; nothing is ever deleted or rewritten.
- **JSON** (`lessons.json`) — full in-place rewrite on every mutation. Small file, safe to rewrite.
- **Markdown** (`PERSONA.md`, `PLAYBOOK.md`, `ACTIVE.md`) — written by the synthesis step. No guaranteed schema, just prose.

If you add a new field to a JSONL record, make it optional. Older records won't have it and the reader must handle that gracefully.

## Project Structure

```
src/
  server.ts         MCP server — createServer() registers all 15 tools
  storage.ts        All read/write functions; defines file paths and data structures
  synthesize.ts     Haiku synthesis — updates PERSONA.md and PLAYBOOK.md via Anthropic API
  synthesize-cli.ts CLI wrapper to run synthesis manually
  setup.ts          Agent detection (detectAgents) and MCP config writing (mergeMcpConfig, runSetup)
  cli.ts            zug binary — status, setup, update, tail, persona, compact commands
  stdio.ts          zug-mcp binary — MCP stdio transport entry point
  http.ts           HTTP/OAuth transport — for remote or multi-machine access
  api-key.ts        API key loading from .env or environment
  merge.ts          Data merge utility for syncing ~/.zug across machines
  *.test.ts         Tests co-located with source files
```

## Anthropic API Key

Some features (`synthesize`, `zug_reasoning_analysis`) require an Anthropic API key. Add it to a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

The key is loaded by `api-key.ts` at runtime. Without it, synthesis and reasoning analysis return a graceful error rather than crashing.
