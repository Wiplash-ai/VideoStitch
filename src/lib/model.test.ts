import { describe, expect, it } from "vitest";
import {
  applyAiOperations,
  clipAtTime,
  clipDuration,
  createEmptyProject,
  createFixturePlan,
  defaultVisualTransform,
  normalizeProject,
  removeTimelineRange,
  timelineDuration,
  type ProjectManifest,
} from "./model";

function projectWithClip(): ProjectManifest {
  const project = createEmptyProject();
  project.assets.push({
    id: "asset-1",
    name: "source.mp4",
    mimeType: "video/mp4",
    size: 1_000,
    durationMs: 10_000,
    width: 1920,
    height: 1080,
    sha256: "abc",
    importedAt: project.createdAt,
  });
  project.clips.push({
    id: "clip-1",
    assetId: "asset-1",
    name: "Source",
    sourceInMs: 1_000,
    sourceOutMs: 9_000,
    color: "coral",
    volume: 1,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    visualFadeInMs: 0,
    visualFadeOutMs: 0,
    transform: defaultVisualTransform(),
  });
  return project;
}

describe("project model", () => {
  it("uses integer source spans for duration and timeline lookup", () => {
    const project = projectWithClip();
    expect(clipDuration(project.clips[0])).toBe(8_000);
    expect(timelineDuration(project.clips)).toBe(8_000);
    expect(clipAtTime(project.clips, 2_500)?.offsetMs).toBe(2_500);
  });

  it("normalizes older manifests without audio, transform, B-roll, transcript, or overlay fields", () => {
    const project = projectWithClip();
    const old = structuredClone(project) as unknown as Record<string, unknown>;
    delete old.overlays;
    delete old.approvals;
    delete old.brollClips;
    delete old.transcript;
    const clips = old.clips as Array<Record<string, unknown>>;
    delete clips[0].volume;
    delete clips[0].transform;
    const normalized = normalizeProject(old as unknown as ProjectManifest);
    expect(normalized.clips[0].volume).toBe(1);
    expect(normalized.overlays).toEqual([]);
    expect(normalized.approvals).toEqual([]);
    expect(normalized.brollClips).toEqual([]);
    expect(normalized.transcript).toEqual([]);
    expect(normalized.clips[0].transform).toEqual(defaultVisualTransform());
  });

  it("applies selected fixture operations into a new revision", () => {
    const project = projectWithClip();
    const plan = createFixturePlan(project);
    expect(plan).not.toBeNull();
    project.editPlans.push(plan!);
    const next = applyAiOperations(project, [plan!.operations[0].id]);
    expect(next.revisions).toHaveLength(2);
    expect(next.clips[0].sourceInMs).toBeGreaterThan(project.clips[0].sourceInMs);
    expect(next.editPlans[0].operations[0].status).toBe("accepted");
  });

  it("refuses to apply a stale AI plan", () => {
    const project = projectWithClip();
    const plan = createFixturePlan(project)!;
    plan.baseRevisionId = "older-revision";
    project.editPlans.push(plan);
    expect(() => applyAiOperations(project, [plan.operations[0].id])).toThrow(/older revision/i);
  });

  it("removes a transcript range and ripples V1, V2, text, and transcript timing", () => {
    const project = projectWithClip();
    project.brollClips.push({
      id: "broll-1",
      assetId: "asset-1",
      name: "Cutaway",
      timelineStartMs: 1_000,
      sourceInMs: 0,
      sourceOutMs: 7_000,
      opacity: 1,
      visualFadeInMs: 0,
      visualFadeOutMs: 0,
      transform: defaultVisualTransform("cover"),
    });
    project.overlays.push({ id: "text-1", kind: "caption", text: "Hello", startMs: 5_000, endMs: 7_000, position: "bottom", fontSize: 56, color: "#fff", background: true });
    project.transcript.push({ id: "cue-1", startMs: 2_000, endMs: 3_000, text: "remove me", source: "imported" });
    project.transcript.push({ id: "cue-2", startMs: 5_000, endMs: 6_000, text: "keep me", source: "imported" });

    const next = removeTimelineRange(project, 2_000, 3_000);

    expect(timelineDuration(next.clips)).toBe(7_000);
    expect(next.clips).toHaveLength(2);
    expect(next.brollClips).toHaveLength(2);
    expect(next.brollClips[1].timelineStartMs).toBe(2_000);
    expect(next.overlays[0]).toMatchObject({ startMs: 4_000, endMs: 6_000 });
    expect(next.transcript).toHaveLength(1);
    expect(next.transcript[0]).toMatchObject({ text: "keep me", startMs: 4_000, endMs: 5_000 });
    expect(next.revisions).toHaveLength(2);
  });
});
