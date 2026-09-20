# Releasing zug-mcp

Zug ships to **three independent surfaces**. They do not update each other, and a change is only
"live" once each one that matters for it has been updated. Most confusion during a release comes
from treating them as one thing.

| Surface | What it runs | How it updates | Who it affects |
|---|---|---|---|
| **Fly** (`zug-mcp.fly.dev`) | The canonical server: sync, **synthesis**, per-tenant storage | `fly deploy` — builds from `src/` via Docker, **never touches npm** | Anyone in synced mode |
| **npm** (`zug-mcp`) | The published CLI + MCP stdio server | `npm publish` | New installs, `zug update` |
| **Local global install** | Your own `zug-mcp` / `zug` commands | `npm i -g zug-mcp@X.Y.Z` | Just this machine |

Two consequences worth internalising:

- **In synced mode, synthesis runs on Fly, not locally.** `server.ts` gates local synthesis behind
  `if (mode !== "synced")`. If `~/.zug/config` has a `ZUG_URL`, a local rebuild does nothing for
  PERSONA — only a `fly deploy` does.
- **`npm install -g .` creates a symlink, not a copy.** The global `zug-mcp` then points at the repo
  working tree and follows branch checkouts, so checking out an unrelated branch silently changes
  the running server. Use `npm i -g zug-mcp@X.Y.Z` for a real install.

## The flow

### 1. Work on a branch off `main`

```bash
git checkout -b fix/ISS-0XX-short-slug main
```

Check whether `main` itself is ahead of `origin/main` before branching — unpushed local commits ride
along on the eventual `git push origin main`.

### 2. Build, typecheck, test

```bash
npx tsc --noEmit
npx vitest run          # server
(cd web && npx vitest run)
```

### 3. Verify against the real corpus, not just the suite

For anything touching synthesis, run it end-to-end against the actual PERSONA/PLAYBOOK with a
**sandboxed data dir**, so nothing in `~/.zug` is touched:

```bash
mkdir -p /tmp/zugcheck && cp ~/.zug/PERSONA.md ~/.zug/PLAYBOOK.md /tmp/zugcheck/
export $(grep ANTHROPIC_API_KEY ~/.zug/.env | xargs)
ZUG_DATA_DIR=/tmp/zugcheck node -e '...import dist/synthesize.js and call synthesize()...'
```

Then **read the output**, don't just check the outcome flag. Two real defects were caught this way
and by nothing else: the prompt's own `## Session Summary` heading coming back as a PERSONA section,
and `[Nx]` reinforcement counts being rewritten upward. Compare headings and counts against the
pre-change document.

### 4. Record the issue and the changelog

- `.story/issues/ISS-0XX.json` — match the existing schema (`impact` carries the mechanism and the
  evidence; `resolution` carries the fix and how it was verified).
- `CHANGELOG.md` — add under `## [Unreleased]`.

### 5. Commit, merge, release-commit

```bash
git commit                                    # fix(scope): ... (ISS-0XX)
git checkout main && git merge --ff-only <branch>
# bump package.json version + change "## [Unreleased]" to "## [X.Y.Z] — YYYY-MM-DD"
git commit -m "chore(release): X.Y.Z"
git push origin main
```

The `chore(release): X.Y.Z` commit is always separate from the fix commit — see `96a4397`, `72dad44`,
`fee7692`.

**Version choice:** minor bump for new behavior (new outcome values, new on-disk artifacts, changed
tool output), patch for pure fixes. 1.4.0 was a minor because compaction, `SynthesisResult.complete`,
the `partial` / `compaction-failed` outcomes, and `PERSONA.archive.md` were all new.

### 6. Publish to npm

```bash
npm publish --auth-type=web
```

**Always `--auth-type=web`.** The account has 2FA on publish; a plain `npm publish` fails with
`EOTP` and demands an OTP paste that expires in ~30s. Web auth opens a browser approval instead.

`prepublishOnly` runs `pnpm build && pnpm test` first, so a broken tree cannot ship.

### 7. Deploy to Fly

```bash
fly deploy --now
```

Separate from the npm publish — Fly builds from source and ignores the registry. Verify with
`fly status -a zug-mcp` and, for anything subtle, grep the deployed bundle:

```bash
fly ssh console -a zug-mcp -C "grep -n 'readPersona' /app/dist/sync-server.js"
```

### 8. Refresh the local install

```bash
npm i -g zug-mcp@X.Y.Z     # real copy, not a symlink
```

The running MCP server process keeps the old code loaded — changes appear in the next session.

## Verification gotchas

**Query the source of truth, not a local mirror.** `~/.zug/*.md` and `~/.zug/synthesis-status.json`
are a synced *cache* and can lag the server by many minutes. For anything about live behavior, read
the server:

```bash
fly ssh console -a zug-mcp -C "cat /data/.zug/users/default/.zug/synthesis-status.json"
```

Likewise for npm — `npm view` can mislead. The registry API is authoritative:

```bash
curl -s https://registry.npmjs.org/zug-mcp | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['dist-tags'], sorted(d['versions']))"
```

**A staged version blocks its own retry.** If a publish fails *after* uploading the tarball (e.g.
`EOTP`), npm leaves the version staged: it is absent from the registry's version list and time index,
but a retry returns `409 Cannot publish over previously staged version`. Either wait for staging to
clear, or bump to the next patch version and publish that.

**`zug backup` before anything that rewrites PERSONA.**

```bash
zug backup      # → ~/.zug-backup/YYYY-MM-DD[-HHMMSS]/
```

Compaction also writes `PERSONA.archive.md` server-side before replacing the document, so content is
recoverable either way — but a volume snapshot covers everything else.

## Post-release check

```bash
curl -s https://registry.npmjs.org/zug-mcp | python3 -c "import sys,json; print(json.load(sys.stdin)['dist-tags'])"
fly status -a zug-mcp | grep -A3 PROCESS
zug --version
```
