import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectAgents, mergeMcpConfig, mergeClaudeHooks, runSetup } from "./setup";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-setup-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("detectAgents", () => {
  it("returns all false when no agent dirs exist", () => {
    const result = detectAgents({ home: tmpDir });
    expect(result).toEqual({ claude: false, cursor: false, windsurf: false });
  });

  it("detects claude when ~/.claude exists", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude"));
    const result = detectAgents({ home: tmpDir });
    expect(result).toEqual({ claude: true, cursor: false, windsurf: false });
  });

  it("detects cursor when ~/.cursor exists", () => {
    fs.mkdirSync(path.join(tmpDir, ".cursor"));
    const result = detectAgents({ home: tmpDir });
    expect(result).toEqual({ claude: false, cursor: true, windsurf: false });
  });

  it("detects windsurf when ~/.codeium/windsurf exists", () => {
    fs.mkdirSync(path.join(tmpDir, ".codeium", "windsurf"), { recursive: true });
    const result = detectAgents({ home: tmpDir });
    expect(result).toEqual({ claude: false, cursor: false, windsurf: true });
  });
});

describe("mergeMcpConfig", () => {
  it("creates a new file with zug entry when file does not exist", () => {
    const configPath = path.join(tmpDir, "config.json");
    mergeMcpConfig(configPath);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.mcpServers.zug).toEqual({ type: "stdio", command: "zug-mcp", args: [] });
  });

  it("adds mcpServers.zug when file exists without mcpServers key", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ otherKey: "value" }), "utf-8");
    mergeMcpConfig(configPath);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.otherKey).toBe("value");
    expect(written.mcpServers.zug).toEqual({ type: "stdio", command: "zug-mcp", args: [] });
  });

  it("preserves existing mcpServers entries and adds zug", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { other: { command: "other-mcp", args: [] } } }),
      "utf-8"
    );
    mergeMcpConfig(configPath);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.mcpServers.other).toEqual({ command: "other-mcp", args: [] });
    expect(written.mcpServers.zug).toEqual({ type: "stdio", command: "zug-mcp", args: [] });
  });

  it("is idempotent — calling twice produces the same result", () => {
    const configPath = path.join(tmpDir, "config.json");
    mergeMcpConfig(configPath);
    mergeMcpConfig(configPath);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.mcpServers.zug).toEqual({ type: "stdio", command: "zug-mcp", args: [] });
    expect(Object.keys(written.mcpServers)).toHaveLength(1);
  });

  it("treats malformed JSON as empty and writes clean config", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, "not valid json {{{{", "utf-8");
    mergeMcpConfig(configPath);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.mcpServers.zug).toEqual({ type: "stdio", command: "zug-mcp", args: [] });
  });
});

describe("mergeClaudeHooks", () => {
  const ZUG = "zug";

  it("creates settings.json with both hooks when file does not exist", () => {
    const settingsPath = path.join(tmpDir, "settings.json");
    mergeClaudeHooks(settingsPath, ZUG);
    const written = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(written.hooks.PreCompact).toHaveLength(1);
    expect(written.hooks.PreCompact[0]).toEqual({
      matcher: "",
      hooks: [{ type: "command", command: "zug compact" }],
    });
    expect(written.hooks.SessionStart).toHaveLength(1);
    expect(written.hooks.SessionStart[0]).toEqual({
      matcher: "compact",
      hooks: [{ type: "command", command: "zug resume" }],
    });
  });

  it("adds hooks to existing settings without a hooks key", () => {
    const settingsPath = path.join(tmpDir, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify({ theme: "dark" }), "utf-8");
    mergeClaudeHooks(settingsPath, ZUG);
    const written = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(written.theme).toBe("dark");
    expect(written.hooks.PreCompact).toHaveLength(1);
    expect(written.hooks.SessionStart).toHaveLength(1);
  });

  it("is idempotent — calling twice does not duplicate hooks", () => {
    const settingsPath = path.join(tmpDir, "settings.json");
    mergeClaudeHooks(settingsPath, ZUG);
    mergeClaudeHooks(settingsPath, ZUG);
    const written = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(written.hooks.PreCompact).toHaveLength(1);
    expect(written.hooks.SessionStart).toHaveLength(1);
  });

  it("preserves non-zug entries in PreCompact and SessionStart", () => {
    const settingsPath = path.join(tmpDir, "settings.json");
    const existing = {
      hooks: {
        PreCompact: [{ matcher: "other", hooks: [{ type: "command", command: "other-tool run" }] }],
        SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "other-tool start" }] }],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existing), "utf-8");
    mergeClaudeHooks(settingsPath, ZUG);
    const written = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(written.hooks.PreCompact).toHaveLength(2);
    expect(written.hooks.PreCompact[0].hooks[0].command).toBe("other-tool run");
    expect(written.hooks.SessionStart).toHaveLength(2);
    expect(written.hooks.SessionStart[0].hooks[0].command).toBe("other-tool start");
  });

  it("creates parent directory if it does not exist", () => {
    const settingsPath = path.join(tmpDir, "subdir", "settings.json");
    mergeClaudeHooks(settingsPath, ZUG);
    expect(fs.existsSync(settingsPath)).toBe(true);
  });
});

describe("runSetup — PERSONA seeding", () => {
  it("creates PERSONA.md when it does not exist", async () => {
    const dataDir = path.join(tmpDir, ".zug");
    await runSetup({ home: tmpDir, dataDir, quiet: true });
    const content = fs.readFileSync(path.join(dataDir, "PERSONA.md"), "utf-8");
    expect(content).toMatch(/^# Cognitive Fingerprint/);
  });

  it("does not overwrite existing PERSONA.md", async () => {
    const dataDir = path.join(tmpDir, ".zug");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "PERSONA.md"), "sentinel content", "utf-8");
    await runSetup({ home: tmpDir, dataDir, quiet: true });
    const content = fs.readFileSync(path.join(dataDir, "PERSONA.md"), "utf-8");
    expect(content).toBe("sentinel content");
  });
});
