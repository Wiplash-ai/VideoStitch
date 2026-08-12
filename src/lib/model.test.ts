import { describe, expect, it } from "vitest";
import {
  applyAiOperations,
  clipAtTime,
  clipDuration,
  createEmptyProject,
  createFixturePlan,
  normalizeProject,
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

  it("normalizes older manifests without audio or overlay fields", () => {
    const project = projectWithClip();
    const old = structuredClone(project) as unknown as Record<string, unknown>;
    delete old.overlays;
    delete old.approvals;
    const clips = old.clips as Array<Record<string, unknown>>;
    delete clips[0].volume;
    const normalized = normalizeProject(old as unknown as ProjectManifest);
    expect(normalized.clips[0].volume).toBe(1);
    expect(normalized.overlays).toEqual([]);
    expect(normalized.approvals).toEqual([]);
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
});
