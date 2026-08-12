import { describe, expect, it } from "vitest";
import { validateEditPlan } from "./editPlan";
import { applyAiOperations, createEmptyProject, type EditPlan } from "./model";

function projectAndPlan() {
  const project = createEmptyProject();
  project.assets.push({ id: "asset", name: "source.mp4", mimeType: "video/mp4", size: 10, durationMs: 8_000, width: 1280, height: 720, sha256: "abc", importedAt: project.createdAt });
  project.clips.push({ id: "clip", assetId: "asset", name: "Source", sourceInMs: 0, sourceOutMs: 8_000, color: "coral", volume: 1, muted: false, fadeInMs: 0, fadeOutMs: 0, visualFadeInMs: 0, visualFadeOutMs: 0 });
  const plan: EditPlan = {
    schemaVersion: "videostitch.edit-plan.v1",
    id: "plan",
    baseRevisionId: project.currentRevisionId,
    name: "Agent pass",
    createdAt: new Date().toISOString(),
    provenance: "Test agent",
    viewerGoal: "Make a readable social cut.",
    sourceCoordinateSystem: "source-milliseconds",
    uncertainties: [],
    protectedBeats: ["Product proof"],
    operations: [{
      id: "text-op",
      kind: "add-text",
      title: "Add title",
      detail: "Show a title at the beginning",
      rationale: "Establishes context.",
      confidence: "high",
      status: "proposed",
      overlay: { kind: "title", text: "VideoStitch", startMs: 0, endMs: 2_000, position: "center", fontSize: 80, color: "#ffffff", background: false },
    }],
  };
  return { project, plan };
}

describe("external edit plan validation", () => {
  it("accepts and applies a current, supported plan", () => {
    const { project, plan } = projectAndPlan();
    const validated = validateEditPlan(plan, project);
    expect(validated.errors).toEqual([]);
    project.editPlans.push(validated.plan!);
    const next = applyAiOperations(project, ["text-op"]);
    expect(next.overlays[0].text).toBe("VideoStitch");
    expect(next.revisions).toHaveLength(2);
  });

  it("rejects stale revisions and unknown clips", () => {
    const { project, plan } = projectAndPlan();
    plan.baseRevisionId = "stale";
    plan.operations = [{ ...plan.operations[0], kind: "remove-clip", clipId: "missing" }];
    const result = validateEditPlan(plan, project);
    expect(result.plan).toBeNull();
    expect(result.errors.join(" ")).toMatch(/baseRevisionId/);
    expect(result.errors.join(" ")).toMatch(/unknown/);
  });

  it("rejects invalid coordinate systems and duplicate operation IDs", () => {
    const { project, plan } = projectAndPlan();
    (plan as unknown as { sourceCoordinateSystem: string }).sourceCoordinateSystem = "seconds";
    plan.operations.push(structuredClone(plan.operations[0]));
    const result = validateEditPlan(plan, project);
    expect(result.errors.join(" ")).toMatch(/sourceCoordinateSystem/);
    expect(result.errors.join(" ")).toMatch(/unique/);
  });
});
