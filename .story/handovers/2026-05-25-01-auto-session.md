# Session Handover — 2026-05-25

## What Was Accomplished

**T-030** — HTTP transport deployment guide for claude.ai web integration.

Added a "Deploy for claude.ai" section to README.md with concrete fly.io steps (fly launch, volume create, secrets, deploy) and the claude.ai OAuth connect flow. Added claude.ai web to the agent support table. Expanded the configuration table with ZUG_URL, ANTHROPIC_API_KEY, PORT, and ZUG_TOKEN — all were undocumented.

The `fly.toml` and `Dockerfile` already existed in the repo and were correct; no changes were needed to either.

## State

- 29/31 tickets complete.
- Remaining open: T-028 (automated observation→lesson pipeline), T-031 (learning feedback loop).
- Issue tracker clean (0 open).

## What's Next

Push. Then T-028 or T-031 if continuing.