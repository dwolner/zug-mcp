import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectAgents, mergeMcpConfig } from "./setup";

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
    expect(written.mcpServers.zug).toEqual({ command: "zug-mcp", args: [] });
  });

  it("adds mcpServers.zug when file exists without mcpServers key", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ otherKey: "value" }), "utf-8");
    mergeMcpConfig(configPath);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.otherKey).toBe("value");
    expect(written.mcpServers.zug).toEqual({ command: "zug-mcp", args: [] });
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
    expect(written.mcpServers.zug).toEqual({ command: "zug-mcp", args: [] });
  });

  it("is idempotent — calling twice produces the same result", () => {
    const configPath = path.join(tmpDir, "config.json");
    mergeMcpConfig(configPath);
    mergeMcpConfig(configPath);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.mcpServers.zug).toEqual({ command: "zug-mcp", args: [] });
    expect(Object.keys(written.mcpServers)).toHaveLength(1);
  });

  it("treats malformed JSON as empty and writes clean config", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, "not valid json {{{{", "utf-8");
    mergeMcpConfig(configPath);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.mcpServers.zug).toEqual({ command: "zug-mcp", args: [] });
  });
});
