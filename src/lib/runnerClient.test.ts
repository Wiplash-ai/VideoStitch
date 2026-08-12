import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "./model";
import { HostedRunnerError, runHostedEditPlan } from "./runnerClient";

const config = {
  baseUrl: "http://localhost:8788/",
  apiKey: "vst_test_secret",
  sessionId: "ses_1",
  projectId: "prj_1",
};

afterEach(() => vi.restoreAllMocks());

describe("hosted runner client", () => {
  it("submits, polls, and returns the edit plan without putting the key in the URL", async () => {
    const project = createEmptyProject();
    project.clips.push({ id: "clip_1", assetId: "asset_1", name: "Clip", sourceInMs: 0, sourceOutMs: 1000, color: "coral", volume: 1, muted: false, fadeInMs: 0, fadeOutMs: 0, visualFadeInMs: 0, visualFadeOutMs: 0 });
    const plan = { schemaVersion: "videostitch.edit-plan.v1", id: "plan_1", baseRevisionId: project.currentRevisionId, operations: [] };
    const responses = [
      new Response(JSON.stringify({ id: "job_1", status: "queued" }), { status: 202 }),
      new Response(JSON.stringify({ id: "job_1", status: "succeeded" }), { status: 200 }),
      new Response(JSON.stringify(plan), { status: 200 }),
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift()!);

    const result = await runHostedEditPlan({ config, project, instruction: "Trim the ending", pollMs: 0 });

    expect(result).toEqual(plan);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://localhost:8788/v1/jobs");
    expect(String(url)).not.toContain(config.apiKey);
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${config.apiKey}`);
  });

  it("surfaces stable API error codes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: { code: "grant_required", message: "Grant required." } }), { status: 403 }),
    );
    await expect(runHostedEditPlan({ config, project: createEmptyProject(), instruction: "Edit" })).rejects.toMatchObject({ code: "grant_required", status: 403 } satisfies Partial<HostedRunnerError>);
  });
});
