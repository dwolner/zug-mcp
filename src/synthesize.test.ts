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

import { synthesize, SYNTHESIS_TIMEOUT_MS, type SynthesisInput } from "./synthesize";

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

beforeEach(() => {
  mockStream.mockReset();
  mockCtor.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
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

    it("includes trim instruction when persona exceeds 600 lines", async () => {
      const longPersona = Array(601).fill("line").join("\n");

      await synthesize({ ...BASE_INPUT, currentPersona: longPersona });

      const prompt = mockStream.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain("IMPORTANT: The persona is 601 lines");
    });

    it("omits trim instruction when persona is within the 600-line limit", async () => {
      const shortPersona = Array(600).fill("line").join("\n");

      await synthesize({ ...BASE_INPUT, currentPersona: shortPersona });

      const prompt = mockStream.mock.calls[0][0].messages[0].content as string;
      expect(prompt).not.toContain("IMPORTANT: The persona is");
    });

    it("uses haiku model", async () => {
      await synthesize(BASE_INPUT);

      expect(mockStream.mock.calls[0][0].model).toBe("claude-haiku-4-5-20251001");
    });
  });
});
