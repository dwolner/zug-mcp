import fs from "fs";
import path from "path";
import os from "os";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockStream = vi.hoisted(() => vi.fn());
const mockCtor = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  // Must be a regular function (not arrow) so `new Anthropic()` works
  default: vi.fn(function MockAnthropic(opts: unknown) {
    mockCtor(opts);
    return { messages: { stream: mockStream } };
  }),
}));

import {
  synthesize,
  SYNTHESIS_TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
  OBSERVED_OUTPUT_TOKENS_PER_SEC,
  estimateReEmitTokens,
  type SynthesisInput,
} from "./synthesize";
import { readSynthesisStatus } from "./storage";

const BASE_INPUT: SynthesisInput = {
  currentPersona: "# Persona\nSome existing content",
  currentPlaybook: "# Playbook\nSome existing playbook",
  sessionSummary: "We discussed architecture patterns.",
  observations: [],
};

// Builds the raw text the mock should return (everything AFTER the prefilled "<PERSONA>" tag)
function makeRaw(persona: string, playbook: string, active?: string): string {
  let raw = `\n${persona}\n</PERSONA>\n\n<PLAYBOOK>\n${playbook}\n</PLAYBOOK>`;
  if (active !== undefined) {
    raw += `\n\n<ACTIVE>\n${active}\n</ACTIVE>`;
  }
  return raw;
}

/** Mock a streamed response whose finalMessage() resolves to the given text blocks. */
function mockStreamText(text: string, extra: Record<string, unknown> = {}): void {
  mockStream.mockReturnValue({
    finalMessage: vi.fn().mockResolvedValue({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      ...extra,
    }),
  });
}

let tmpDir: string;

beforeEach(() => {
  mockStream.mockReset();
  mockCtor.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
  // synthesize() records its outcome to disk (ISS-047); keep the suite off the real ~/.zug.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-synth-test-"));
  process.env.ZUG_DATA_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ZUG_DATA_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("synthesize", () => {
  describe("valid API response", () => {
    it("parses PERSONA, PLAYBOOK, and ACTIVE blocks", async () => {
      mockStreamText(makeRaw("Updated persona", "Updated playbook", "When X → do Y"));

      const result = await synthesize(BASE_INPUT);

      expect(result).toEqual({
        persona: "Updated persona",
        playbook: "Updated playbook",
        active: "When X → do Y",
      });
    });

    it("returns empty string for active when ACTIVE block is absent", async () => {
      mockStreamText(makeRaw("Persona content", "Playbook content"));

      const result = await synthesize(BASE_INPUT);

      expect(result?.active).toBe("");
    });

    it("trims whitespace from parsed block content", async () => {
      mockStreamText(makeRaw("  Persona  ", "  Playbook  ", "  Active  "));

      const result = await synthesize(BASE_INPUT);

      expect(result?.persona).toBe("Persona");
      expect(result?.playbook).toBe("Playbook");
      expect(result?.active).toBe("Active");
    });
  });

  describe("malformed API response", () => {
    it("returns null when PERSONA block is missing", async () => {
      mockStreamText("\nNo persona tag here\n<PLAYBOOK>\nPlaybook\n</PLAYBOOK>");

      const result = await synthesize(BASE_INPUT);
      expect(result).toBeNull();
    });

    it("returns null when PLAYBOOK block is missing", async () => {
      mockStreamText("\nPersona content\n</PERSONA>\n\nNo playbook here");

      const result = await synthesize(BASE_INPUT);
      expect(result).toBeNull();
    });
  });

  // ISS-045: a full-document re-emit measures ~3,790 output tokens at ~72 tok/s = ~53s.
  // The old config (non-streaming create, timeout 30_000) could never complete, so every
  // synthesis on the Fly server timed out and PERSONA was frozen for three months.
  describe("request configuration (ISS-045)", () => {
    beforeEach(() => {
      mockStreamText(makeRaw("p", "pb", "a"));
    });

    it("streams the response instead of issuing one blocking create", async () => {
      await synthesize(BASE_INPUT);

      expect(mockStream).toHaveBeenCalledTimes(1);
    });

    it("allows far more time than the measured worst-case generation", async () => {
      // Measured worst case was 52.9s. A 30s timeout is what caused ISS-045; the floor
      // here is deliberately well above measurement so corpus growth does not re-break it.
      expect(SYNTHESIS_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000);
    });

    it("passes that timeout to the Anthropic client", async () => {
      await synthesize(BASE_INPUT);

      expect(mockCtor).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: SYNTHESIS_TIMEOUT_MS }),
      );
    });

    it("completes a generation that takes longer than the old 30s timeout", async () => {
      mockStream.mockReturnValue({
        finalMessage: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    content: [{ type: "text", text: makeRaw("slow persona", "slow playbook") }],
                    stop_reason: "end_turn",
                  }),
                10,
              ),
            ),
        ),
      });

      const result = await synthesize(BASE_INPUT);

      expect(result?.persona).toBe("slow persona");
    });
  });

  // ISS-046: max_tokens was 4096 against a corpus needing ~4,006 tokens to re-emit -- 90 tokens
  // of headroom. Meanwhile PERSONA_LINE_LIMIT=600 gated the trim instruction, so the guardrail
  // could not fire until roughly 5x past the point where the ceiling already broke synthesis.
  describe("output budget (ISS-046)", () => {
    beforeEach(() => {
      mockStreamText(makeRaw("p", "pb", "a"));
    });

    it("requests an output budget with real headroom over the measured corpus", async () => {
      await synthesize(BASE_INPUT);

      // A verbatim re-emit of the live corpus measured 3,790 tokens. 4096 was not headroom.
      expect(mockStream.mock.calls[0][0].max_tokens).toBe(MAX_OUTPUT_TOKENS);
      expect(MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(3_790 * 3);
    });

    // The invariant that ISS-046 was really about: two independently-chosen constants that
    // silently described an impossible request. Worst-case generation must fit the timeout.
    it("keeps the output budget generatable within the timeout budget", () => {
      const worstCaseMs = (MAX_OUTPUT_TOKENS / OBSERVED_OUTPUT_TOKENS_PER_SEC) * 1000;
      expect(worstCaseMs).toBeLessThan(SYNTHESIS_TIMEOUT_MS);
    });

    it("triggers the trim instruction before the corpus can reach the ceiling", async () => {
      // Sized from the budget rather than a magic line count, so this stays true if either moves.
      const oversized = "x".repeat(MAX_OUTPUT_TOKENS * 4);
      expect(estimateReEmitTokens(oversized, "")).toBeGreaterThan(MAX_OUTPUT_TOKENS);

      await synthesize({ ...BASE_INPUT, currentPersona: oversized });

      const prompt = mockStream.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain("IMPORTANT:");
      expect(prompt).toContain("Summarize the oldest dated sections");
    });

    it("trims while the corpus still fits, not after it has already overflowed", async () => {
      // At the trigger point the documents must still be re-emittable, or the instruction to
      // shorten them cannot itself be carried out.
      const oversized = "x".repeat(MAX_OUTPUT_TOKENS * 4);
      await synthesize({ ...BASE_INPUT, currentPersona: oversized });

      const prompt = mockStream.mock.calls[0][0].messages[0].content as string;
      const triggerLine = prompt.split("\n").find((l) => l.startsWith("IMPORTANT:")) ?? "";
      expect(triggerLine).toMatch(/\d+ tokens/);
    });

    it("reports truncation distinctly from a malformed response", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockStreamText("\nPersona that runs out of budget mid-docum", { stop_reason: "max_tokens" });

      const result = await synthesize(BASE_INPUT);

      expect(result).toBeNull();
      expect(warn.mock.calls.flat().join(" ")).toContain("truncated");
      warn.mockRestore();
    });

    it("still reports a genuinely malformed response as malformed, not truncated", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockStreamText("\nNo closing tag at all", { stop_reason: "end_turn" });

      const result = await synthesize(BASE_INPUT);

      expect(result).toBeNull();
      expect(warn.mock.calls.flat().join(" ")).not.toContain("truncated");
      warn.mockRestore();
    });
  });

  describe("prompt construction", () => {
    beforeEach(() => {
      mockStreamText(makeRaw("p", "pb", "a"));
    });

    it("uses 'No observations this session.' when observations array is empty", async () => {
      await synthesize({ ...BASE_INPUT, observations: [] });

      const prompt = mockStream.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain("No observations this session.");
    });

    it("formats observations as bullet list with type, confidence, and text", async () => {
      await synthesize({
        ...BASE_INPUT,
        observations: [
          { type: "cognitive_pattern", observation: "Thinks top-down", confidence: "high" },
          { type: "preference", observation: "Prefers concise", confidence: "medium" },
        ],
      });

      const prompt = mockStream.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain("- [cognitive_pattern/high] Thinks top-down");
      expect(prompt).toContain("- [preference/medium] Prefers concise");
    });

    it("omits the trim instruction while the corpus fits comfortably in the budget", async () => {
      await synthesize(BASE_INPUT);

      const prompt = mockStream.mock.calls[0][0].messages[0].content as string;
      expect(prompt).not.toContain("IMPORTANT:");
    });

    it("uses haiku model", async () => {
      await synthesize(BASE_INPUT);

      expect(mockStream.mock.calls[0][0].model).toBe("claude-haiku-4-5-20251001");
    });
  });
});

// ISS-047: every one of these paths used to end in a silent `return null`, distinguishable only
// by a console line on a server nobody was watching.
describe("outcome recording (ISS-047)", () => {
  it("records ok on success", async () => {
    mockStreamText(makeRaw("p", "pb", "a"));
    await synthesize(BASE_INPUT);
    expect(readSynthesisStatus()?.outcome).toBe("ok");
  });

  it("records truncated when the output budget is exhausted", async () => {
    mockStreamText("\nran out mid-docum", { stop_reason: "max_tokens" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await synthesize(BASE_INPUT);
    expect(readSynthesisStatus()?.outcome).toBe("truncated");
    vi.restoreAllMocks();
  });

  it("records malformed when the response parses badly", async () => {
    mockStreamText("\nno closing tag", { stop_reason: "end_turn" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await synthesize(BASE_INPUT);
    expect(readSynthesisStatus()?.outcome).toBe("malformed");
    vi.restoreAllMocks();
  });

  it("records no-api-key when the key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await synthesize(BASE_INPUT);
    expect(readSynthesisStatus()?.outcome).toBe("no-api-key");
    vi.restoreAllMocks();
  });

  // The actual ISS-045 failure. It must be recorded, and it must still propagate so the queue
  // logs it too — swallowing it here would trade one blind spot for another.
  it("records timeout and rethrows so the queue still sees the failure", async () => {
    mockStream.mockReturnValue({
      finalMessage: vi.fn().mockRejectedValue(new Error("Request timed out.")),
    });

    await expect(synthesize(BASE_INPUT)).rejects.toThrow("Request timed out.");
    const status = readSynthesisStatus();
    expect(status?.outcome).toBe("timeout");
    expect(status?.detail).toContain("Request timed out.");
  });

  it("records error for a non-timeout failure", async () => {
    mockStream.mockReturnValue({
      finalMessage: vi.fn().mockRejectedValue(new Error("500 internal server error")),
    });

    await expect(synthesize(BASE_INPUT)).rejects.toThrow();
    expect(readSynthesisStatus()?.outcome).toBe("error");
  });
});
