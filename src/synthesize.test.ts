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
  COMPACTION_TRIGGER_TOKENS,
  COMPACTION_TARGET_TOKENS,
  estimateDocTokens,
  type SynthesisInput,
} from "./synthesize";
import { readSynthesisStatus } from "./storage";

const BASE_INPUT: SynthesisInput = {
  currentPersona: "# Persona\nSome existing content",
  currentPlaybook: "# Playbook\nSome existing playbook",
  sessionSummary: "We discussed architecture patterns.",
  observations: [],
};

/** Which of the three prompt kinds a request is, read off its prefilled assistant turn. */
type CallKind = "persona" | "playbook" | "compact";

function kindOf(req: any): CallKind {
  const prefill = req.messages[1].content as string;
  if (prefill === "<PERSONA>") return "persona";
  if (prefill === "<PLAYBOOK>") return "playbook";
  return "compact";
}

interface Reply {
  text: string;
  stop_reason?: string;
}

/**
 * Route each streamed call by kind. Synthesis issues one call per document (plus an optional
 * compaction call), so a single canned response can no longer stand in for the whole run.
 */
function mockByKind(handler: (kind: CallKind, req: any) => Reply): void {
  mockStream.mockImplementation((req: any) => {
    const { text, stop_reason = "end_turn" } = handler(kindOf(req), req);
    return {
      finalMessage: vi.fn().mockResolvedValue({
        content: [{ type: "text", text }],
        stop_reason,
      }),
    };
  });
}

/** The happy path: each document call closes its own tag. Text is everything AFTER the prefill. */
function mockDocs(opts: {
  persona?: string;
  playbook?: string;
  active?: string;
  personaStop?: string;
  playbookStop?: string;
  compacted?: string;
}): void {
  mockByKind((kind) => {
    if (kind === "compact") {
      return { text: `\n${opts.compacted ?? "compacted doc"}\n</DOC>` };
    }
    if (kind === "persona") {
      const active = opts.active !== undefined ? `\n\n<ACTIVE>\n${opts.active}\n</ACTIVE>` : "";
      return {
        text: `\n${opts.persona ?? "Updated persona"}\n</PERSONA>${active}`,
        stop_reason: opts.personaStop,
      };
    }
    return {
      text: `\n${opts.playbook ?? "Updated playbook"}\n</PLAYBOOK>`,
      stop_reason: opts.playbookStop,
    };
  });
}

function callsOfKind(kind: CallKind): any[] {
  return mockStream.mock.calls.map((c) => c[0]).filter((req) => kindOf(req) === kind);
}

function promptOf(kind: CallKind): string {
  return callsOfKind(kind)[0].messages[0].content as string;
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
      mockDocs({ persona: "Updated persona", playbook: "Updated playbook", active: "When X → do Y" });

      const result = await synthesize(BASE_INPUT);

      expect(result).toEqual({
        persona: "Updated persona",
        playbook: "Updated playbook",
        active: "When X → do Y",
        complete: true,
      });
    });

    it("returns empty string for active when ACTIVE block is absent", async () => {
      mockDocs({});

      const result = await synthesize(BASE_INPUT);

      expect(result?.active).toBe("");
    });

    it("trims whitespace from parsed block content", async () => {
      mockDocs({ persona: "  Persona  ", playbook: "  Playbook  ", active: "  Active  " });

      const result = await synthesize(BASE_INPUT);

      expect(result?.persona).toBe("Persona");
      expect(result?.playbook).toBe("Playbook");
      expect(result?.active).toBe("Active");
    });
  });

  // ISS-054: one document failing used to discard the other one's work too, because both were
  // produced by the same call. Independent calls make partial success representable — and the
  // `complete` flag is what stops a caller from treating it as a full absorb.
  describe("partial failure", () => {
    it("keeps the good document and falls back to the current text for the failed one", async () => {
      mockByKind((kind) =>
        kind === "persona"
          ? { text: "\ngarbage with no closing tag" }
          : { text: "\nUpdated playbook\n</PLAYBOOK>" },
      );

      const result = await synthesize(BASE_INPUT);

      expect(result?.persona).toBe(BASE_INPUT.currentPersona);
      expect(result?.playbook).toBe("Updated playbook");
    });

    it("does not report completeness when a document failed", async () => {
      mockByKind((kind) =>
        kind === "persona"
          ? { text: "\ngarbage with no closing tag" }
          : { text: "\nUpdated playbook\n</PLAYBOOK>" },
      );

      const result = await synthesize(BASE_INPUT);

      expect(result?.complete).toBe(false);
    });

    it("records a partial outcome rather than ok", async () => {
      mockByKind((kind) =>
        kind === "persona"
          ? { text: "\ntruncated mid-document", stop_reason: "max_tokens" }
          : { text: "\nUpdated playbook\n</PLAYBOOK>" },
      );

      await synthesize(BASE_INPUT);

      const status = readSynthesisStatus();
      expect(status?.outcome).toBe("partial");
      expect(status?.detail).toMatch(/persona/i);
    });

    it("returns null only when every document failed", async () => {
      mockByKind(() => ({ text: "\nno closing tags anywhere" }));

      const result = await synthesize(BASE_INPUT);

      expect(result).toBeNull();
      expect(readSynthesisStatus()?.outcome).toBe("malformed");
    });
  });

  // ISS-054 root cause: one call re-emitted PERSONA + PLAYBOOK together, so required output
  // tracked the size of the WHOLE corpus. The corpus reached 18,438 tokens against a 16,384
  // ceiling and every synthesis truncated. Per-document calls make the ceiling per-document.
  describe("per-document calls (ISS-054)", () => {
    it("issues one call per document instead of one call for the corpus", async () => {
      mockDocs({});

      await synthesize(BASE_INPUT);

      expect(callsOfKind("persona")).toHaveLength(1);
      expect(callsOfKind("playbook")).toHaveLength(1);
    });

    it("does not put the playbook in the persona call, or vice versa", async () => {
      mockDocs({});

      await synthesize({
        ...BASE_INPUT,
        currentPersona: "PERSONA-MARKER",
        currentPlaybook: "PLAYBOOK-MARKER",
      });

      expect(promptOf("persona")).toContain("PERSONA-MARKER");
      expect(promptOf("persona")).not.toContain("PLAYBOOK-MARKER");
      expect(promptOf("playbook")).toContain("PLAYBOOK-MARKER");
      expect(promptOf("playbook")).not.toContain("PERSONA-MARKER");
    });

    it("gives each call the full output budget", async () => {
      mockDocs({});

      await synthesize(BASE_INPUT);

      expect(callsOfKind("persona")[0].max_tokens).toBe(MAX_OUTPUT_TOKENS);
      expect(callsOfKind("playbook")[0].max_tokens).toBe(MAX_OUTPUT_TOKENS);
    });

    // The exact corpus that broke synthesis on 2026-09-20, reproduced by size.
    it("absorbs the live corpus that truncated under a single combined call", async () => {
      const persona = "x".repeat(44_462);
      const playbook = "y".repeat(28_089);
      // Combined, this is the 18,438 tokens that overflowed the 16,384 ceiling.
      expect(estimateDocTokens(persona) + estimateDocTokens(playbook)).toBeGreaterThan(MAX_OUTPUT_TOKENS);
      // Separately, each document fits.
      expect(estimateDocTokens(persona)).toBeLessThan(MAX_OUTPUT_TOKENS);
      expect(estimateDocTokens(playbook)).toBeLessThan(MAX_OUTPUT_TOKENS);

      mockDocs({ compacted: "z".repeat(COMPACTION_TARGET_TOKENS * 2) });

      const result = await synthesize({ ...BASE_INPUT, currentPersona: persona, currentPlaybook: playbook });

      expect(result?.complete).toBe(true);
      expect(readSynthesisStatus()?.outcome).toBe("ok");
    });
  });

  // The guardrail ISS-046 tried to install as a prompt instruction and that never bounded
  // anything: the corpus grew from the 9,830-token trigger to 18,438 while the instruction was
  // in every prompt. A control loop has to MEASURE its own effect, which is what this does.
  describe("compaction (ISS-054)", () => {
    const oversized = () => "x".repeat(COMPACTION_TRIGGER_TOKENS * 4 + 4_000);

    it("leaves documents under the trigger alone", async () => {
      mockDocs({});

      await synthesize(BASE_INPUT);

      expect(callsOfKind("compact")).toHaveLength(0);
    });

    it("compacts a document that crosses the trigger before synthesizing it", async () => {
      mockDocs({ compacted: "small persona" });

      await synthesize({ ...BASE_INPUT, currentPersona: oversized() });

      expect(callsOfKind("compact")).toHaveLength(1);
      expect(promptOf("persona")).toContain("small persona");
    });

    it("asks for a target well below the trigger so it does not re-fire next session", () => {
      expect(COMPACTION_TARGET_TOKENS).toBeLessThan(COMPACTION_TRIGGER_TOKENS);
      expect(COMPACTION_TRIGGER_TOKENS).toBeLessThan(MAX_OUTPUT_TOKENS);
    });

    it("archives the pre-compaction document so nothing is silently dropped", async () => {
      mockDocs({ compacted: "small persona" });

      await synthesize({ ...BASE_INPUT, currentPersona: oversized() });

      const archive = path.join(tmpDir, "PERSONA.archive.md");
      expect(fs.existsSync(archive)).toBe(true);
      expect(fs.readFileSync(archive, "utf-8")).toContain(oversized());
    });

    // The failure the old trim instruction could never detect.
    it("reports compaction that did not actually shrink the document", async () => {
      mockDocs({ compacted: oversized() });

      await synthesize({ ...BASE_INPUT, currentPersona: oversized() });

      const status = readSynthesisStatus();
      expect(status?.outcome).toBe("compaction-failed");
      expect(status?.detail).toMatch(/persona/i);
    });

    it("keeps the original document when compaction fails rather than losing content", async () => {
      const big = oversized();
      mockDocs({ compacted: "" });

      await synthesize({ ...BASE_INPUT, currentPersona: big });

      expect(promptOf("persona")).toContain(big);
    });
  });

  // ISS-045: a full-document re-emit measures ~3,790 output tokens at ~72 tok/s = ~53s.
  // The old config (non-streaming create, timeout 30_000) could never complete, so every
  // synthesis on the Fly server timed out and PERSONA was frozen for three months.
  describe("request configuration (ISS-045)", () => {
    beforeEach(() => {
      mockDocs({});
    });

    it("streams the response instead of issuing one blocking create", async () => {
      await synthesize(BASE_INPUT);

      for (const req of mockStream.mock.calls.map((c) => c[0])) {
        expect(req.max_tokens).toBe(MAX_OUTPUT_TOKENS);
      }
      expect(mockStream).toHaveBeenCalled();
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
      mockStream.mockImplementation((req: any) => ({
        finalMessage: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    content: [{
                      type: "text",
                      text: kindOf(req) === "persona"
                        ? "\nslow persona\n</PERSONA>"
                        : "\nslow playbook\n</PLAYBOOK>",
                    }],
                    stop_reason: "end_turn",
                  }),
                10,
              ),
            ),
        ),
      }));

      const result = await synthesize(BASE_INPUT);

      expect(result?.persona).toBe("slow persona");
    });
  });

  describe("output budget (ISS-046)", () => {
    beforeEach(() => {
      mockDocs({});
    });

    it("requests an output budget with real headroom over the measured corpus", async () => {
      await synthesize(BASE_INPUT);

      // A verbatim re-emit of the live corpus measured 3,790 tokens. 4096 was not headroom.
      expect(callsOfKind("persona")[0].max_tokens).toBe(MAX_OUTPUT_TOKENS);
      expect(MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(3_790 * 3);
    });

    // The invariant that ISS-046 was really about: two independently-chosen constants that
    // silently described an impossible request. Worst-case generation must fit the timeout.
    it("keeps the output budget generatable within the timeout budget", () => {
      const worstCaseMs = (MAX_OUTPUT_TOKENS / OBSERVED_OUTPUT_TOKENS_PER_SEC) * 1000;
      expect(worstCaseMs).toBeLessThan(SYNTHESIS_TIMEOUT_MS);
    });

    // ISS-054: the trigger now has to leave room for a compaction call to run AND for the
    // compacted document to be re-emitted, not merely for the oversized one to squeak through.
    it("triggers compaction while the document can still be re-emitted", () => {
      expect(COMPACTION_TRIGGER_TOKENS).toBeLessThan(MAX_OUTPUT_TOKENS);
    });
  });

  describe("truncation vs malformed", () => {
    it("reports truncation distinctly from a malformed response", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockByKind(() => ({ text: "\nran out of budget mid-docum", stop_reason: "max_tokens" }));

      const result = await synthesize(BASE_INPUT);

      expect(result).toBeNull();
      expect(warn.mock.calls.flat().join(" ")).toContain("truncated");
      warn.mockRestore();
    });

    it("still reports a genuinely malformed response as malformed, not truncated", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockByKind(() => ({ text: "\nNo closing tag at all", stop_reason: "end_turn" }));

      const result = await synthesize(BASE_INPUT);

      expect(result).toBeNull();
      expect(warn.mock.calls.flat().join(" ")).not.toContain("truncated");
      warn.mockRestore();
    });
  });

  describe("prompt construction", () => {
    beforeEach(() => {
      mockDocs({});
    });

    it("uses 'No observations this session.' when observations array is empty", async () => {
      await synthesize({ ...BASE_INPUT, observations: [] });

      expect(promptOf("persona")).toContain("No observations this session.");
    });

    it("formats observations as bullet list with type, confidence, and text", async () => {
      await synthesize({
        ...BASE_INPUT,
        observations: [
          { type: "cognitive_pattern", observation: "Thinks top-down", confidence: "high" },
          { type: "preference", observation: "Prefers concise", confidence: "medium" },
        ],
      });

      // Both documents are updated from the same session evidence, so both calls carry it.
      for (const kind of ["persona", "playbook"] as const) {
        expect(promptOf(kind)).toContain("- [cognitive_pattern/high] Thinks top-down");
        expect(promptOf(kind)).toContain("- [preference/medium] Prefers concise");
      }
    });

    // Both observed in a live run before these guards existed: the prompt's own "## Session
    // Summary" heading came back as a PERSONA section, and the [Nx] reinforcement counts were
    // rewritten upward ([1x] 17 -> 1, [2x] 6 -> 15) — fabricated evidence of recurrence.
    it("fences session evidence off from the document being rewritten", async () => {
      await synthesize(BASE_INPUT);

      for (const kind of ["persona", "playbook"] as const) {
        expect(promptOf(kind)).toContain("NOT PART OF THE DOCUMENT");
        expect(promptOf(kind)).not.toContain("## Session Summary");
      }
    });

    it("tells the model the reinforcement counts are data, not its judgement", async () => {
      await synthesize({
        ...BASE_INPUT,
        reinforcedPatterns: [{ text: "checks primary sources", count: 2 }],
      });

      const prompt = promptOf("persona");
      expect(prompt).toContain("- [2x] checks primary sources");
      expect(prompt).toMatch(/never raise a count/i);
    });

    it("uses haiku model for every call", async () => {
      await synthesize(BASE_INPUT);

      for (const req of mockStream.mock.calls.map((c) => c[0])) {
        expect(req.model).toBe("claude-haiku-4-5-20251001");
      }
    });
  });
});

// ISS-047: every one of these paths used to end in a silent `return null`, distinguishable only
// by a console line on a server nobody was watching.
describe("outcome recording (ISS-047)", () => {
  it("records ok on success", async () => {
    mockDocs({});
    await synthesize(BASE_INPUT);
    expect(readSynthesisStatus()?.outcome).toBe("ok");
  });

  it("records truncated when the output budget is exhausted", async () => {
    mockByKind(() => ({ text: "\nran out mid-docum", stop_reason: "max_tokens" }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await synthesize(BASE_INPUT);
    expect(readSynthesisStatus()?.outcome).toBe("truncated");
    vi.restoreAllMocks();
  });

  it("records malformed when the response parses badly", async () => {
    mockByKind(() => ({ text: "\nno closing tag", stop_reason: "end_turn" }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await synthesize(BASE_INPUT);
    expect(readSynthesisStatus()?.outcome).toBe("malformed");
    vi.restoreAllMocks();
  });

  it("records no-api-key when the key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await synthesize(BASE_INPUT);
    expect(result).toBeNull();
    expect(readSynthesisStatus()?.outcome).toBe("no-api-key");
    expect(mockStream).not.toHaveBeenCalled();
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

  // A transport failure on ONE document must not discard the other one's work.
  it("does not rethrow when only one document's call failed", async () => {
    mockStream.mockImplementation((req: any) =>
      kindOf(req) === "persona"
        ? { finalMessage: vi.fn().mockRejectedValue(new Error("500 internal server error")) }
        : { finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "\nUpdated playbook\n</PLAYBOOK>" }],
            stop_reason: "end_turn",
          }) },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await synthesize(BASE_INPUT);

    expect(result?.playbook).toBe("Updated playbook");
    expect(result?.complete).toBe(false);
    expect(readSynthesisStatus()?.outcome).toBe("partial");
    vi.restoreAllMocks();
  });
});
