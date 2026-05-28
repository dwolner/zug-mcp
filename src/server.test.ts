import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { digestLessons, getOpenThread, resetOpenThread, setOpenThreadForTesting, growthSummary, createServer, ZUG_INSTRUCTIONS, handleReasoningAnalysis, runEndSession } from "./server";
import { createLesson, reinforceLesson, writeLessons, appendGrowthSnapshot, appendObservation, type Lesson } from "./storage";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-server-test-"));
  process.env.ZUG_DATA_DIR = tmpDir;
  resetOpenThread();
});

afterEach(() => {
  resetOpenThread();
  delete process.env.ZUG_DATA_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("digestLessons", () => {
  it("returns empty string when no lessons exist", () => {
    expect(digestLessons()).toBe("");
  });

  it("returns empty string when all lessons are non-active", () => {
    const lesson = createLesson({ title: "T", content: "c", context: "ctx", source: "manual", tags: [] });
    const now = new Date().toISOString();
    writeLessons([{ ...lesson, status: "deprecated" }]);
    expect(digestLessons()).toBe("");
  });

  it("returns ranked markdown with N active lessons", () => {
    const alpha = createLesson({ title: "Alpha", content: "Do alpha things.", context: "ctx", source: "manual", tags: [] });
    const beta = createLesson({ title: "Beta", content: "Do beta things.", context: "ctx", source: "review", tags: [] });
    const digest = digestLessons();
    expect(digest).toContain("## Lessons (2 active)");
    expect(digest).toContain(`[${alpha.id}] Alpha`);
    expect(digest).toContain(`[${beta.id}] Beta`);
  });

  it("omits reinforcement suffix when reinforcementCount is 0", () => {
    createLesson({ title: "T", content: "c", context: "ctx", source: "manual", tags: [] });
    const digest = digestLessons();
    expect(digest).not.toContain("reinforced");
  });

  it("includes reinforcement suffix when reinforcementCount > 0", () => {
    const lesson = createLesson({ title: "T", content: "c", context: "ctx", source: "manual", tags: [] });
    reinforceLesson(lesson.id);
    reinforceLesson(lesson.id);
    const digest = digestLessons();
    expect(digest).toContain("(reinforced 2x)");
  });

  it("ranks lessons by reinforcementCount descending", () => {
    const low = createLesson({ title: "Low", content: "cl", context: "ctx", source: "manual", tags: [] });
    const high = createLesson({ title: "High", content: "ch", context: "ctx", source: "manual", tags: [] });
    reinforceLesson(high.id);
    reinforceLesson(high.id);
    const digest = digestLessons();
    const lowIdx = digest.indexOf("Low");
    const highIdx = digest.indexOf("High");
    expect(highIdx).toBeLessThan(lowIdx);
  });
});

describe("openThread state", () => {
  it("getOpenThread returns null initially", () => {
    expect(getOpenThread()).toBeNull();
  });

  it("setOpenThreadForTesting sets retrievable state", () => {
    setOpenThreadForTesting("What do you think the real constraint is here?", "session-1");
    const t = getOpenThread();
    expect(t?.question).toBe("What do you think the real constraint is here?");
    expect(t?.sessionId).toBe("session-1");
    expect(t?.openedAt).toBeTruthy();
  });

  it("resetOpenThread clears state", () => {
    setOpenThreadForTesting("A question", "session-1");
    resetOpenThread();
    expect(getOpenThread()).toBeNull();
  });

  it("opening a second thread replaces the first", () => {
    setOpenThreadForTesting("First question", "session-1");
    setOpenThreadForTesting("Second question", "session-1");
    expect(getOpenThread()?.question).toBe("Second question");
  });
});

describe("growthSummary", () => {
  it("returns no-data message when growth.jsonl is empty", () => {
    expect(growthSummary()).toBe("No growth data yet. Run a session first.");
  });

  it("includes session count and observation trend when snapshots exist", () => {
    appendGrowthSnapshot({
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: "s1",
      sessionCount: 1,
      observationCount: 10,
      personaLines: 20,
      topPatterns: [{ text: "Ask before explaining", count: 3 }],
      activePatternCount: 2,
      lessonCount: 1,
    });
    appendGrowthSnapshot({
      timestamp: "2026-01-02T00:00:00.000Z",
      sessionId: "s2",
      sessionCount: 2,
      observationCount: 15,
      personaLines: 25,
      topPatterns: [{ text: "Ask before explaining", count: 5 }],
      activePatternCount: 3,
      lessonCount: 2,
    });
    const summary = growthSummary();
    expect(summary).toContain("## Growth Summary (2 sessions)");
    expect(summary).toContain("10 → 15");
    expect(summary).toContain('"Ask before explaining" (5x)');
    expect(summary).toContain("20 → 25");
  });
});

describe("ZUG_INSTRUCTIONS", () => {
  it("is defined and mentions zug_get_context", () => {
    expect(ZUG_INSTRUCTIONS).toBeTruthy();
    expect(ZUG_INSTRUCTIONS).toContain("zug_get_context");
  });
});

describe("handleReasoningAnalysis", () => {
  it("returns no-api-key error when API key is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await handleReasoningAnalysis("I think we should choose option A because it is better.");
    expect(result.content[0].text).toContain("No API key configured");
  });
});

describe("synced-mode gate behavior", () => {
  const today = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    // synced mode: ZUG_URL + ZUG_TOKEN set, ZUG_CANONICAL unset
    process.env.ZUG_URL = "https://example.test";
    process.env.ZUG_TOKEN = "tok";
    delete process.env.ZUG_CANONICAL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ZUG_URL;
    delete process.env.ZUG_TOKEN;
    delete process.env.ZUG_CANONICAL;
  });

  it("zug_end_session does NOT append persona locally in synced mode (server owns synthesis)", async () => {
    // Stub fetch so push() succeeds without a real server
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(
        JSON.stringify({ accepted: {}, highWater: "2026-05-28T00:00:00.000Z" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    ));

    // Record a meaningful (high-confidence) observation for this session
    appendObservation({
      timestamp: new Date().toISOString(),
      type: "preference",
      observation: "synced-mode obs",
      session_id: "2026-05-28-x",
      confidence: "high",
    });

    await runEndSession({ session_id: "2026-05-28-x", summary: "did things" });

    const personaPath = path.join(tmpDir, "PERSONA.md");
    const persona = fs.existsSync(personaPath) ? fs.readFileSync(personaPath, "utf-8") : "";
    expect(persona).not.toContain("synced-mode obs");
  });

  it("local-only mode still appends persona synchronously (regression guard)", async () => {
    // local-only: remove ZUG_URL and ZUG_TOKEN
    delete process.env.ZUG_URL;
    delete process.env.ZUG_TOKEN;

    appendObservation({
      timestamp: new Date().toISOString(),
      type: "preference",
      observation: "local-mode obs",
      session_id: "2026-05-28-y",
      confidence: "high",
    });

    await runEndSession({ session_id: "2026-05-28-y", summary: "did things" });

    const personaPath = path.join(tmpDir, "PERSONA.md");
    const persona = fs.readFileSync(personaPath, "utf-8");
    // local mode appends lines like: - [preference] local-mode obs *(2026-05-28)*
    expect(persona).toContain("local-mode obs");
    expect(persona).toContain(`*(${today})*`);
  });
});
