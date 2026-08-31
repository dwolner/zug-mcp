import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

/**
 * These tests guard the seams that shipped two broken releases in a row: the
 * `files` allowlist, the CLI dispatch, and the README are all hand-maintained
 * and nothing checked them against each other. T-054 shipped a `cli.js` that
 * required an unpublished `version-check.js`; `onboard` was promised by three
 * surfaces and never wired into the dispatch (ISS-052). Both are drift between
 * documents that no compiler reads together.
 */

const ROOT = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")) as {
  main: string;
  bin: Record<string, string>;
  files: string[];
};
const cliSource = fs.readFileSync(path.join(ROOT, "src", "cli.ts"), "utf-8");
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf-8");

/** `dist/a/x.js` → absolute path of the `src/a/x.ts` it is compiled from. */
function sourceFor(distPath: string): string {
  return path.join(ROOT, distPath.replace(/^dist\//, "src/").replace(/\.js$/, ".ts"));
}

/**
 * Every relative-import form that survives compilation as a runtime `require`:
 * `from "./x.js"`, bare side-effect `import "./x.js"`, dynamic `import("./x.js")`,
 * and `import x = require("./x.js")` / `require("./x.js")`. Type-only imports are
 * elided by tsc and excluded — requiring them in `files` would over-publish.
 */
const RELATIVE_IMPORT =
  /(?:\bfrom\s+|^\s*import\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["'](\.\.?\/[^"']+)["']/gm;
const TYPE_ONLY_IMPORT = /^\s*import\s+type\b/;

/** Walks the require-graph of a published entrypoint, flat-mapped onto dist/. */
function publishedClosure(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const distPath = queue.shift()!;
    if (seen.has(distPath)) continue;
    seen.add(distPath);
    const source = sourceFor(distPath);
    if (!fs.existsSync(source)) continue;
    const dir = path.posix.dirname(distPath);
    for (const line of fs.readFileSync(source, "utf-8").split("\n")) {
      if (TYPE_ONLY_IMPORT.test(line)) continue;
      for (const match of line.matchAll(RELATIVE_IMPORT)) {
        queue.push(path.posix.normalize(path.posix.join(dir, match[1])));
      }
    }
  }
  return seen;
}

/** Command words from the ``` block under `## CLI` in the README. */
function readmeCommands(): string[] {
  const block = readme.match(/^## CLI\n+```[a-z]*\n([\s\S]*?)```/m);
  if (!block) throw new Error("README has no fenced CLI block under '## CLI'");
  const commands = [...block[1].matchAll(/^`?zug ([a-z][a-z0-9-]*)/gm)].map((m) => m[1]);
  if (commands.length === 0) throw new Error("README CLI block parsed to zero commands — the format drifted");
  return commands;
}

/** Command words from the usage text `printUsage()` prints. */
function usageCommands(): string[] {
  const block = cliSource.match(/function printUsage\(\)[\s\S]*?\n}/);
  if (!block) throw new Error("cli.ts has no printUsage()");
  const commands = [...block[0].matchAll(/^\s+zug ([a-z][a-z0-9-]*)/gm)].map((m) => m[1]);
  if (commands.length === 0) throw new Error("printUsage() parsed to zero commands — the format drifted");
  return commands;
}

/** Command words the dispatch actually handles. */
function dispatchCommands(): string[] {
  const block = cliSource.match(/async function main\(\)[\s\S]*?\n}/);
  if (!block) throw new Error("cli.ts has no main()");
  const commands = [...block[0].matchAll(/case "([^"]+)":/g)].map((m) => m[1]);
  if (commands.length === 0) throw new Error("cli.ts main() parsed to zero cases — the dispatch shape changed");
  return commands;
}

/** `version` and `--version` are conventional and deliberately not in the CLI table. */
const UNDOCUMENTED_BY_DESIGN = new Set(["version", "--version"]);

describe("packaging invariants", () => {
  it("publishes every module the published entrypoints import", () => {
    // Every published dist file is an entrypoint: dist/http.js is the Dockerfile CMD
    // and `scripts.start:http`, but is neither `main` nor in `bin`.
    const published = new Set(pkg.files.filter((f) => f.startsWith("dist/")));
    const required = publishedClosure([...published, pkg.main, ...Object.values(pkg.bin)]);

    const missing = [...required].filter((m) => !published.has(m));
    expect(missing, `imported by a published entrypoint but absent from package.json "files"`).toEqual([]);

    const unbacked = [...published].filter((m) => !fs.existsSync(sourceFor(m)));
    expect(unbacked, `listed in "files" but no src/*.ts compiles to it — npm drops it silently`).toEqual([]);
  });

  it("dispatches every command the README documents", () => {
    const dispatched = new Set(dispatchCommands());
    const undispatched = readmeCommands().filter((c) => !dispatched.has(c));
    expect(undispatched, "documented in README's CLI block but not handled by cli.ts").toEqual([]);
  });

  it("dispatches every command the usage text prints", () => {
    const dispatched = new Set(dispatchCommands());
    const undispatched = usageCommands().filter((c) => !dispatched.has(c));
    expect(undispatched, "printed by printUsage() but not handled by cli.ts").toEqual([]);
  });

  it("documents every command it dispatches", () => {
    const documented = new Set(readmeCommands());
    const undocumented = dispatchCommands().filter(
      (c) => !UNDOCUMENTED_BY_DESIGN.has(c) && !documented.has(c),
    );
    expect(undocumented, "handled by cli.ts but missing from README's CLI block").toEqual([]);
  });

  it("only invokes src modules that self-execute", () => {
    // Turning a script into a pure module (exporting instead of running) makes every
    // shell/npm caller a silent no-op that still exits 0, so `|| fallback` never fires.
    const callers: Record<string, string> = {
      "install.sh": fs.readFileSync(path.join(ROOT, "install.sh"), "utf-8"),
      "package.json scripts": JSON.stringify(
        (JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")) as { scripts: Record<string, string> }).scripts,
      ),
    };
    const SELF_EXECUTES = /^[a-zA-Z_$][\w$.]*\s*\(/m;

    const inert: string[] = [];
    for (const [caller, text] of Object.entries(callers)) {
      for (const match of text.matchAll(/src\/([a-z][a-z0-9-]*)\.ts/g)) {
        const source = path.join(ROOT, "src", `${match[1]}.ts`);
        if (!fs.existsSync(source)) { inert.push(`${caller} → src/${match[1]}.ts (missing)`); continue; }
        if (!SELF_EXECUTES.test(fs.readFileSync(source, "utf-8"))) inert.push(`${caller} → src/${match[1]}.ts`);
      }
    }
    expect(inert, "invoked as a script but has no top-level call — runs, prints nothing, exits 0").toEqual([]);
  });

  it("never tells an npm-installed user to run a repo script", () => {
    const offenders: string[] = [];
    for (const distPath of publishedClosure([pkg.main, ...Object.values(pkg.bin)])) {
      const source = sourceFor(distPath);
      if (!fs.existsSync(source)) continue;
      for (const [line, i] of fs
        .readFileSync(source, "utf-8")
        .split("\n")
        .map((l, i) => [l, i] as const)) {
        if (/\b(pnpm|npm run|yarn)\s+[a-z]/.test(line)) offenders.push(`${path.basename(source)}:${i + 1}`);
      }
    }
    expect(offenders, "published code instructs the user to run a package script").toEqual([]);
  });
});
