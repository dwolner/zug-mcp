import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readPersona, writePersona,
  readPlaybook, writePlaybook,
  readActive, writeActive,
  appendObservation, getObservationsBySession,
  writeSession, getRecentSessions,
  getStats,
  getLastSessionDate,
  getPersonaExcerpt,
  getObservationTrend,
  type Observation,
} from "./storage";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zug-test-"));
  process.env.ZUG_DATA_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.ZUG_DATA_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("readPersona / writePersona", () => {
  it("returns empty string when file does not exist", () => {
    expect(readPersona()).toBe("");
  });

  it("roundtrips content", () => {
    writePersona("# Persona\nHello world");
    expect(readPersona()).toBe("# Persona\nHello world");
  });
});

describe("readPlaybook / writePlaybook", () => {
  it("returns empty string when file does not exist", () => {
    expect(readPlaybook()).toBe("");
  });

  it("roundtrips content", () => {
    writePlaybook("# Playbook\nDo things");
    expect(readPlaybook()).toBe("# Playbook\nDo things");
  });
});

describe("readActive / writeActive", () => {
  it("returns empty string when file does not exist", () => {
    expect(readActive()).toBe("");
  });

  it("roundtrips content", () => {
    writeActive("Pattern 1\nPattern 2");
    expect(readActive()).toBe("Pattern 1\nPattern 2");
  });
});

describe("appendObservation / getObservationsBySession", () => {
  const obsA: Observation = {
    timestamp: "2026-01-01T00:00:00.000Z",
    type: "cognitive_pattern",
    observation: "Thinks in systems",
    session_id: "session-a",
    confidence: "high",
  };
  const obsB: Observation = {
    timestamp: "2026-01-01T01:00:00.000Z",
    type: "preference",
    observation: "Prefers concise responses",
    session_id: "session-b",
    confidence: "medium",
  };

  it("returns empty array when observations file does not exist", () => {
    expect(getObservationsBySession("session-a")).toEqual([]);
  });

  it("filters observations by session_id", () => {
    appendObservation(obsA);
    appendObservation(obsB);

    expect(getObservationsBySession("session-a")).toEqual([obsA]);
    expect(getObservationsBySession("session-b")).toEqual([obsB]);
    expect(getObservationsBySession("session-x")).toEqual([]);
  });

  it("accumulates multiple observations for the same session", () => {
    const obsA2: Observation = { ...obsA, observation: "Also builds systems" };
    appendObservation(obsA);
    appendObservation(obsA2);

    const results = getObservationsBySession("session-a");
    expect(results).toHaveLength(2);
    expect(results[0].observation).toBe("Thinks in systems");
    expect(results[1].observation).toBe("Also builds systems");
  });

  it("skips malformed JSONL lines without throwing", () => {
    const { observationsFile } = getPaths();
    // Write a valid line, a corrupt line, then another valid line
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      observationsFile,
      JSON.stringify(obsA) + "\nnot-json\n" + JSON.stringify(obsB) + "\n",
      "utf-8",
    );
    expect(getObservationsBySession("session-a")).toEqual([obsA]);
    expect(getObservationsBySession("session-b")).toEqual([obsB]);
  });
});

// Expose getPaths for direct path access in tests
function getPaths() {
  const zugDir = process.env.ZUG_DATA_DIR!;
  return {
    observationsFile: path.join(zugDir, "observations.jsonl"),
  };
}

describe("writeSession / getRecentSessions", () => {
  it("returns empty array when sessions directory is empty", () => {
    expect(getRecentSessions(10)).toEqual([]);
  });

  it("returns sessions in reverse sort order", () => {
    writeSession("alpha", "Alpha content");
    writeSession("beta", "Beta content");

    const sessions = getRecentSessions(10);
    expect(sessions).toHaveLength(2);
    // 'beta' sorts after 'alpha', so reverse gives beta first
    expect(sessions[0]).toContain("Beta content");
    expect(sessions[1]).toContain("Alpha content");
  });

  it("respects the limit", () => {
    writeSession("a", "A content");
    writeSession("b", "B content");
    writeSession("c", "C content");

    expect(getRecentSessions(2)).toHaveLength(2);
  });

  it("filters sessions by context tag", () => {
    writeSession("work", "Context: work\nWork session content");
    writeSession("personal", "Context: personal\nPersonal session content");

    const workSessions = getRecentSessions(10, "work");
    expect(workSessions).toHaveLength(1);
    expect(workSessions[0]).toContain("Work session content");
  });

  it("returns no sessions when context does not match any file", () => {
    writeSession("work", "Context: work\nWork session content");
    expect(getRecentSessions(10, "personal")).toEqual([]);
  });

  it("prefixes each result with the filename as a heading", () => {
    writeSession("mysession", "Some content");
    const sessions = getRecentSessions(10);
    expect(sessions[0]).toMatch(/^## \d{4}-\d{2}-\d{2}-mysession\.md/);
  });
});

describe("getStats", () => {
  it("returns zeros when nothing exists", () => {
    expect(getStats()).toEqual({ sessions: 0, observations: 0, personaLines: 0 });
  });

  it("counts sessions, observations, and persona lines", () => {
    writeSession("a", "content a");
    writeSession("b", "content b");
    appendObservation({
      timestamp: "2026-01-01T00:00:00.000Z",
      type: "cognitive_pattern",
      observation: "Test observation",
      session_id: "session-a",
      confidence: "high",
    });
    writePersona("Line 1\nLine 2\nLine 3");

    const stats = getStats();
    expect(stats.sessions).toBe(2);
    expect(stats.observations).toBe(1);
    expect(stats.personaLines).toBe(3);
  });
});

describe("getLastSessionDate", () => {
  it("returns null when no sessions exist", () => {
    expect(getLastSessionDate()).toBeNull();
  });

  it("returns the date of the most recent session", () => {
    writeSession("alpha", "content");
    writeSession("beta", "content");
    const date = getLastSessionDate();
    // date is today's date since writeSession uses new Date()
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getPersonaExcerpt", () => {
  it("returns empty string when PERSONA.md does not exist", () => {
    expect(getPersonaExcerpt()).toBe("");
  });

  it("skips blank lines and heading lines", () => {
    writePersona("# Cognitive Fingerprint\n\n## How you think\n\nThinks in systems.\nMoves top-down.");
    expect(getPersonaExcerpt(2)).toBe("Thinks in systems. Moves top-down.");
  });

  it("skips all levels of markdown headings", () => {
    writePersona("### 2026-05-22\n- [cognitive_pattern] Some observation\nActual content here.");
    expect(getPersonaExcerpt(1)).toBe("- [cognitive_pattern] Some observation");
  });

  it("respects maxLines parameter", () => {
    writePersona("Line one\nLine two\nLine three");
    expect(getPersonaExcerpt(1)).toBe("Line one");
    expect(getPersonaExcerpt(3)).toBe("Line one Line two Line three");
  });
});

describe("getObservationTrend", () => {
  it("returns zeros array of length=weeks when no observations exist", () => {
    expect(getObservationTrend(4)).toEqual([0, 0, 0, 0]);
    expect(getObservationTrend(2)).toEqual([0, 0]);
  });

  it("counts observations in the current week", () => {
    appendObservation({
      timestamp: new Date().toISOString(),
      type: "cognitive_pattern",
      observation: "Recent observation",
      session_id: "s1",
      confidence: "high",
    });
    const trend = getObservationTrend(4);
    // The most recent week is the last bucket (index 3)
    expect(trend[3]).toBe(1);
    expect(trend.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("excludes observations outside the rolling window", () => {
    appendObservation({
      timestamp: "2020-01-01T00:00:00.000Z", // far in the past
      type: "preference",
      observation: "Old observation",
      session_id: "s2",
      confidence: "medium",
    });
    const trend = getObservationTrend(4);
    expect(trend.reduce((a, b) => a + b, 0)).toBe(0);
  });
});
