# ADR-003: In-memory OAuth state (no persistence)

**Status:** Accepted  
**Date:** 2026-05-22  

## Context

The HTTP transport (Phase 3) uses OAuth 2.1 with PKCE for Claude.ai web integration. OAuth state (registered clients, auth codes, access tokens, refresh tokens) must live somewhere. Options: in-memory Maps, SQLite, Redis.

## Decision

Store all OAuth state in in-memory Maps. No persistence to disk.

## Rationale

- **Deployment model.** Zug runs on fly.io with `auto_stop_machines = 'stop'`. The process stops between sessions. Persisting tokens to disk adds complexity with no benefit — clients must re-authorize after a cold start regardless.
- **Single-user.** There is one user and one set of clients (Claude.ai). The token set is tiny. No eviction strategy needed beyond lazy cleanup on expiry.
- **Simplicity.** In-memory state requires no migration, no schema, no backup. The OAuth provider is ~200 lines and self-contained.
- **Security posture.** Tokens that don't survive restarts reduce the blast radius of a compromised token. A stolen token expires naturally on next restart.

## Consequences

- Clients must re-authorize after any server restart (fly.io cold start, deploy, crash). This is an expected UX trade-off documented at startup.
- `/register` endpoint is open — any peer can register a claude.ai redirect URI. PKCE prevents this from being exploitable (auth codes are single-use, 10-min TTL, bound to PKCE verifier). Accepted risk tracked in ISS-013.
- If token persistence becomes painful (frequent cold starts), volume-backed persistence is the migration path. The `OAuthServerProvider` interface is compatible with a persistent backend.
