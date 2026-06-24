import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import fs from "fs";
import path from "path";
// Function-level import only: getDataDir is called inside functions, never at module init, so the
// storage<->tenancy cycle is safe (mirrors the existing storage<->sync-state pattern).
import { getDataDir } from "./storage.js";

/**
 * Per-request tenancy context. The canonical server is multi-tenant (ADR-005 decision 1): every
 * authenticated request runs inside a tenant scope so storage resolves to that user's namespace.
 * Absence of a scope (stdio / local single-user / tests) resolves to the flat legacy path.
 */
export interface TenantContext {
  userId: string;
}

const als = new AsyncLocalStorage<TenantContext>();

const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** The userId all legacy X-Zug-Token callers collapse to until T-045 issues per-account credentials. */
export const DEFAULT_USER_ID = process.env.ZUG_DEFAULT_USER_ID || "default";

/**
 * Validate a userId as a safe single path segment. This is the tenant-isolation boundary: a userId
 * containing `/`, `.`, or `..` could escape into another tenant's directory. The regex structurally
 * forbids traversal. (Symlink escape requires volume-write access, which is already a full compromise —
 * documented trust boundary; see getPaths' containment check for defense-in-depth.)
 */
export function assertSafeUserId(userId: string): string {
  if (!USER_ID_RE.test(userId)) {
    throw new Error(`Invalid userId (must match ${USER_ID_RE}): ${JSON.stringify(userId).slice(0, 80)}`);
  }
  return userId;
}

/**
 * Derive a safe, stable userId from an arbitrary identity string (e.g. an OAuth client_id, whose
 * format is not guaranteed). Pass-through if already a safe segment; otherwise a deterministic hash.
 */
export function toUserId(raw: string): string {
  if (USER_ID_RE.test(raw)) return raw;
  return "c-" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/** Root under which per-user namespaces live: <ZUG_USERS_ROOT>/<userId>/.zug. */
export function getUsersRoot(): string {
  return process.env.ZUG_USERS_ROOT || path.join(path.dirname(getDataDir()), "users");
}

/** Run `fn` with the given tenant scope active. The userId is validated up front. */
export function runWithTenant<T>(userId: string, fn: () => T): T {
  return als.run({ userId: assertSafeUserId(userId) }, fn);
}

/** The active tenant's userId, or undefined when no scope is set (local / stdio / tests). */
export function getCurrentUserId(): string | undefined {
  return als.getStore()?.userId;
}

// Content files/dirs that belong to a single user. Control-plane/client-local files
// (config, sync-state.json) are intentionally excluded; source-id is namespaced via getPaths now.
const CONTENT_ENTRIES = [
  "PERSONA.md",
  "PLAYBOOK.md",
  "ACTIVE.md",
  "observations.jsonl",
  "observations.archive.jsonl",
  "growth.jsonl",
  "reinforcements.jsonl",
  "lessons.jsonl",
  "open-thread.json",
  "source-id",
  "sessions",
];

/**
 * One-time migration of pre-multi-tenancy flat content into the default user's namespace.
 *
 * Idempotency is guarded by a positive `.migrated` marker written only after a successful move —
 * NOT by destination-dir existence, because storage's ensureDirs() can create the dest dir before
 * migration runs, which would falsely trip an existence guard and let the server diverge onto the
 * flat path (PR-2). Must be awaited before the HTTP server starts listening.
 */
export function migrateLegacyData(opts: { defaultUserId?: string } = {}): { migrated: boolean; movedCount: number } {
  const flatDir = getDataDir();
  const defaultUserId = assertSafeUserId(opts.defaultUserId ?? DEFAULT_USER_ID);
  const destDir = path.join(getUsersRoot(), defaultUserId, ".zug");
  const marker = path.join(destDir, ".migrated");

  if (fs.existsSync(marker)) return { migrated: false, movedCount: 0 };

  // Detect legacy flat content by its two anchor files.
  const hasLegacy =
    fs.existsSync(path.join(flatDir, "PERSONA.md")) ||
    fs.existsSync(path.join(flatDir, "observations.jsonl"));
  if (!hasLegacy) return { migrated: false, movedCount: 0 };

  fs.mkdirSync(destDir, { recursive: true });
  let movedCount = 0;
  for (const entry of CONTENT_ENTRIES) {
    const src = path.join(flatDir, entry);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(destDir, entry);
    if (fs.existsSync(dst)) continue; // never clobber an already-migrated entry
    fs.renameSync(src, dst);
    movedCount++;
  }
  fs.writeFileSync(marker, new Date().toISOString(), "utf-8");
  return { migrated: true, movedCount };
}
