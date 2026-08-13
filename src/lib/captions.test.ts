import { describe, expect, it } from "vitest";
import { parseCaptionFile, parseTranscriptFile } from "./captions";

describe("caption import", () => {
  it("parses SRT commas and strips inline tags", () => {
    const cues = parseCaptionFile(`1\n00:00:00,500 --> 00:00:02,250\n<b>Hello</b> VideoStitch`, 5_000);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ text: "Hello VideoStitch", startMs: 500, endMs: 2_250 });
  });

  it("parses WebVTT and clamps cues to the project duration", () => {
    const cues = parseCaptionFile(`WEBVTT\n\n00:01.000 --> 00:07.000\nA longer cue`, 4_000);
    expect(cues[0].startMs).toBe(1_000);
    expect(cues[0].endMs).toBe(4_000);
  });

  it("ignores invalid and out-of-range cues", () => {
    const cues = parseCaptionFile(`00:10.000 --> 00:12.000\nToo late\n\nBad timing\nNo cue`, 5_000);
    expect(cues).toEqual([]);
  });

  it("imports the same timed-text grammar as editable transcript cues", () => {
    const cues = parseTranscriptFile(`WEBVTT\n\n00:00.250 --> 00:01.500\nHost: Keep this`, 3_000);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ startMs: 250, endMs: 1_500, text: "Host: Keep this", source: "imported" });
  });
});
