import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { digestLessons } from "./server";
import { createLesson, reinforceLesson, writeLessons, type Lesson } from "./storage";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-server-test-"));
  process.env.ZUG_DATA_DIR = tmpDir;
});

afterEach(() => {
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
    createLesson({ title: "Alpha", content: "Do alpha things.", context: "ctx", source: "manual", tags: [] });
    createLesson({ title: "Beta", content: "Do beta things.", context: "ctx", source: "review", tags: [] });
    const digest = digestLessons();
    expect(digest).toContain("## Lessons (2 active)");
    expect(digest).toContain("[L-001] Alpha");
    expect(digest).toContain("[L-002] Beta");
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
