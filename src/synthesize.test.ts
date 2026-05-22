import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  // Must be a regular function (not arrow) so `new Anthropic()` works
  default: vi.fn(function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }),
}));

import { synthesize, type SynthesisInput } from "./synthesize";

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

beforeEach(() => {
  mockCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("synthesize", () => {
  describe("valid API response", () => {
    it("parses PERSONA, PLAYBOOK, and ACTIVE blocks", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: makeRaw("Updated persona", "Updated playbook", "When X → do Y") }],
      });

      const result = await synthesize(BASE_INPUT);

      expect(result).toEqual({
        persona: "Updated persona",
        playbook: "Updated playbook",
        active: "When X → do Y",
      });
    });

    it("returns empty string for active when ACTIVE block is absent", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: makeRaw("Persona content", "Playbook content") }],
      });

      const result = await synthesize(BASE_INPUT);

      expect(result?.active).toBe("");
    });

    it("trims whitespace from parsed block content", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: makeRaw("  Persona  ", "  Playbook  ", "  Active  ") }],
      });

      const result = await synthesize(BASE_INPUT);

      expect(result?.persona).toBe("Persona");
      expect(result?.playbook).toBe("Playbook");
      expect(result?.active).toBe("Active");
    });
  });

  describe("malformed API response", () => {
    it("returns null when PERSONA block is missing", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "\nNo persona tag here\n<PLAYBOOK>\nPlaybook\n</PLAYBOOK>" }],
      });

      const result = await synthesize(BASE_INPUT);
      expect(result).toBeNull();
    });

    it("returns null when PLAYBOOK block is missing", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "\nPersona content\n</PERSONA>\n\nNo playbook here" }],
      });

      const result = await synthesize(BASE_INPUT);
      expect(result).toBeNull();
    });
  });

  describe("prompt construction", () => {
    beforeEach(() => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: makeRaw("p", "pb", "a") }],
      });
    });

    it("uses 'No observations this session.' when observations array is empty", async () => {
      await synthesize({ ...BASE_INPUT, observations: [] });

      const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
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

      const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain("- [cognitive_pattern/high] Thinks top-down");
      expect(prompt).toContain("- [preference/medium] Prefers concise");
    });

    it("includes trim instruction when persona exceeds 600 lines", async () => {
      const longPersona = Array(601).fill("line").join("\n");

      await synthesize({ ...BASE_INPUT, currentPersona: longPersona });

      const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(prompt).toContain("IMPORTANT: The persona is 601 lines");
    });

    it("omits trim instruction when persona is within the 600-line limit", async () => {
      const shortPersona = Array(600).fill("line").join("\n");

      await synthesize({ ...BASE_INPUT, currentPersona: shortPersona });

      const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(prompt).not.toContain("IMPORTANT: The persona is");
    });

    it("uses haiku model", async () => {
      await synthesize(BASE_INPUT);

      expect(mockCreate.mock.calls[0][0].model).toBe("claude-haiku-4-5-20251001");
    });
  });
});
