import { describe, expect, it } from "vitest";
import { parseCaptionFile } from "./captions";

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
});
