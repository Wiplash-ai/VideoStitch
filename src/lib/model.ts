export type EditorialMode = "podcast" | "advertisement" | "product-demo" | "custom";
export type AspectRatio = "16:9" | "9:16" | "1:1";

export interface VideoAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  durationMs: number;
  width: number;
  height: number;
  sha256: string;
  importedAt: string;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  name: string;
  sourceInMs: number;
  sourceOutMs: number;
  color: "coral" | "gold" | "sage" | "blue";
  volume: number;
  muted: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  visualFadeInMs: number;
  visualFadeOutMs: number;
}

export interface TextOverlay {
  id: string;
  kind: "caption" | "title";
  text: string;
  startMs: number;
  endMs: number;
  position: "top" | "center" | "bottom";
  fontSize: number;
  color: string;
  background: boolean;
}

interface AiOperationBase {
  id: string;
  title: string;
  detail: string;
  rationale: string;
  confidence: "high" | "medium" | "low";
  status: "proposed" | "accepted" | "rejected";
}

export type AiOperation =
  | {
      kind: "trim-start" | "trim-end";
      amountMs: number;
    } & AiOperationBase
  | {
      kind: "set-aspect";
      ratio: AspectRatio;
    } & AiOperationBase
  | ({ kind: "trim-clip"; clipId: string; sourceInMs: number; sourceOutMs: number } & AiOperationBase)
  | ({ kind: "split-clip"; clipId: string; sourceTimeMs: number } & AiOperationBase)
  | ({ kind: "remove-clip"; clipId: string } & AiOperationBase)
  | ({ kind: "reorder-clips"; clipIds: string[] } & AiOperationBase)
  | ({ kind: "set-clip-audio"; clipId: string; volume: number; muted: boolean; fadeInMs: number; fadeOutMs: number } & AiOperationBase)
  | ({ kind: "add-text"; overlay: Omit<TextOverlay, "id"> } & AiOperationBase);

export interface EditPlan {
  schemaVersion: "videostitch.edit-plan.v1";
  id: string;
  baseRevisionId: string;
  name: string;
  createdAt: string;
  provenance: string;
  viewerGoal: string;
  sourceCoordinateSystem: "source-milliseconds";
  uncertainties: string[];
  protectedBeats: string[];
  operations: AiOperation[];
}

export interface Revision {
  id: string;
  number: number;
  createdAt: string;
  summary: string;
  operationIds: string[];
}

export interface ExportApproval {
  id: string;
  revisionId: string;
  createdAt: string;
  approvedAt: string;
  sha256: string;
  mimeType: string;
  size: number;
  durationMs: number;
  width: number;
  height: number;
}

export interface ProjectManifest {
  schemaVersion: "videostitch.project.v1";
  id: string;
  name: string;
  editorialMode: EditorialMode;
  residency: "local";
  createdAt: string;
  updatedAt: string;
  canvas: {
    ratio: AspectRatio;
    width: number;
    height: number;
  };
  assets: VideoAsset[];
  clips: TimelineClip[];
  overlays: TextOverlay[];
  revisions: Revision[];
  currentRevisionId: string;
  editPlans: EditPlan[];
  approvals: ExportApproval[];
}

const now = () => new Date().toISOString();

export function createEmptyProject(): ProjectManifest {
  const revisionId = crypto.randomUUID();
  const createdAt = now();

  return {
    schemaVersion: "videostitch.project.v1",
    id: crypto.randomUUID(),
    name: "Untitled stitch",
    editorialMode: "podcast",
    residency: "local",
    createdAt,
    updatedAt: createdAt,
    canvas: { ratio: "16:9", width: 1920, height: 1080 },
    assets: [],
    clips: [],
    overlays: [],
    revisions: [
      {
        id: revisionId,
        number: 1,
        createdAt,
        summary: "Project created",
        operationIds: [],
      },
    ],
    currentRevisionId: revisionId,
    editPlans: [],
    approvals: [],
  };
}

export function normalizeProject(project: ProjectManifest): ProjectManifest {
  const normalized = structuredClone(project);
  normalized.clips = normalized.clips.map((clip) => ({
    ...clip,
    volume: typeof clip.volume === "number" ? Math.min(1, Math.max(0, clip.volume)) : 1,
    muted: clip.muted ?? false,
    fadeInMs: clip.fadeInMs ?? 0,
    fadeOutMs: clip.fadeOutMs ?? 0,
    visualFadeInMs: clip.visualFadeInMs ?? 0,
    visualFadeOutMs: clip.visualFadeOutMs ?? 0,
  }));
  normalized.overlays = Array.isArray(normalized.overlays) ? normalized.overlays : [];
  normalized.approvals = Array.isArray(normalized.approvals) ? normalized.approvals : [];
  return normalized;
}

export function commitRevision(
  project: ProjectManifest,
  summary: string,
  mutate: (draft: ProjectManifest) => void,
  operationIds: string[] = [],
): ProjectManifest {
  const draft = structuredClone(project);
  mutate(draft);
  const revision: Revision = {
    id: crypto.randomUUID(),
    number: project.revisions.length + 1,
    createdAt: now(),
    summary,
    operationIds,
  };
  draft.revisions.push(revision);
  draft.currentRevisionId = revision.id;
  draft.updatedAt = revision.createdAt;
  return draft;
}

export function clipDuration(clip: TimelineClip): number {
  return Math.max(0, clip.sourceOutMs - clip.sourceInMs);
}

export function timelineDuration(clips: TimelineClip[]): number {
  return clips.reduce((total, clip) => total + clipDuration(clip), 0);
}

export function activeOverlays(project: ProjectManifest, timeMs: number) {
  return project.overlays.filter((overlay) => timeMs >= overlay.startMs && timeMs <= overlay.endMs);
}

export function clipAtTime(clips: TimelineClip[], timeMs: number) {
  let cursor = 0;
  for (const clip of clips) {
    const duration = clipDuration(clip);
    if (timeMs <= cursor + duration) {
      return { clip, timelineStartMs: cursor, offsetMs: Math.max(0, timeMs - cursor) };
    }
    cursor += duration;
  }
  const clip = clips.at(-1);
  return clip
    ? { clip, timelineStartMs: Math.max(0, cursor - clipDuration(clip)), offsetMs: clipDuration(clip) }
    : null;
}

export function dimensionsForRatio(ratio: AspectRatio) {
  if (ratio === "9:16") return { ratio, width: 1080, height: 1920 } as const;
  if (ratio === "1:1") return { ratio, width: 1080, height: 1080 } as const;
  return { ratio, width: 1920, height: 1080 } as const;
}

export function createFixturePlan(project: ProjectManifest): EditPlan | null {
  const total = timelineDuration(project.clips);
  if (!project.clips.length || total < 2_000) return null;
  const trimAmount = Math.min(2_500, Math.floor(total * 0.06));

  return {
    schemaVersion: "videostitch.edit-plan.v1",
    id: crypto.randomUUID(),
    baseRevisionId: project.currentRevisionId,
    name: "First-pass pacing",
    createdAt: now(),
    provenance: "VideoStitch fixture agent · local demo",
    viewerGoal: "Create a tighter, social-ready first pass while preserving the source meaning.",
    sourceCoordinateSystem: "source-milliseconds",
    uncertainties: ["The fixture does not inspect speech or visual semantics."],
    protectedBeats: ["Original clip order", "All source media"],
    operations: [
      {
        id: crypto.randomUUID(),
        kind: "trim-start",
        title: "Tighten the opening",
        detail: `Remove the first ${formatTime(trimAmount)} of setup`,
        rationale: "Gets to the first useful beat sooner without changing chronology.",
        amountMs: trimAmount,
        confidence: "high",
        status: "proposed",
      },
      {
        id: crypto.randomUUID(),
        kind: "trim-end",
        title: "Clean the tail",
        detail: "Remove the final 1.2 seconds",
        rationale: "Drops likely handling noise after the final spoken beat.",
        amountMs: Math.min(1_200, Math.floor(total * 0.03)),
        confidence: "medium",
        status: "proposed",
      },
      {
        id: crypto.randomUUID(),
        kind: "set-aspect",
        title: "Prepare a vertical cut",
        detail: "Switch the canvas to 9:16",
        rationale: "Creates a social-ready variant while preserving the source edit.",
        ratio: "9:16",
        confidence: "low",
        status: "proposed",
      },
    ],
  };
}

export function applyAiOperations(project: ProjectManifest, operationIds: string[]) {
  const plan = project.editPlans.at(-1);
  if (!plan || plan.baseRevisionId !== project.currentRevisionId) {
    throw new Error("This plan targets an older revision. Generate a fresh plan before applying it.");
  }

  const selected = plan.operations.filter((operation) => operationIds.includes(operation.id));
  if (!selected.length) return project;

  return commitRevision(
    project,
    `Applied ${selected.length} AI ${selected.length === 1 ? "proposal" : "proposals"}`,
    (draft) => {
      for (const operation of selected) {
        if (operation.kind === "trim-start") {
          const first = draft.clips[0];
          if (first && clipDuration(first) > operation.amountMs + 500) {
            first.sourceInMs += operation.amountMs;
          }
        } else if (operation.kind === "trim-end") {
          const last = draft.clips.at(-1);
          if (last && clipDuration(last) > operation.amountMs + 500) {
            last.sourceOutMs -= operation.amountMs;
          }
        } else if (operation.kind === "set-aspect") {
          draft.canvas = dimensionsForRatio(operation.ratio);
        } else if (operation.kind === "trim-clip") {
          const clip = draft.clips.find((candidate) => candidate.id === operation.clipId);
          const asset = clip ? draft.assets.find((candidate) => candidate.id === clip.assetId) : null;
          if (!clip || !asset || operation.sourceInMs < 0 || operation.sourceOutMs > asset.durationMs || operation.sourceOutMs - operation.sourceInMs < 500) {
            throw new Error(`Invalid trim operation for clip ${operation.clipId}.`);
          }
          clip.sourceInMs = operation.sourceInMs;
          clip.sourceOutMs = operation.sourceOutMs;
        } else if (operation.kind === "split-clip") {
          const index = draft.clips.findIndex((candidate) => candidate.id === operation.clipId);
          const clip = draft.clips[index];
          if (!clip || operation.sourceTimeMs - clip.sourceInMs < 300 || clip.sourceOutMs - operation.sourceTimeMs < 300) {
            throw new Error(`Invalid split operation for clip ${operation.clipId}.`);
          }
          const right = { ...clip, id: crypto.randomUUID(), name: `${clip.name} · B`, sourceInMs: operation.sourceTimeMs };
          clip.sourceOutMs = operation.sourceTimeMs;
          draft.clips.splice(index + 1, 0, right);
        } else if (operation.kind === "remove-clip") {
          if (!draft.clips.some((candidate) => candidate.id === operation.clipId)) throw new Error(`Unknown clip ${operation.clipId}.`);
          draft.clips = draft.clips.filter((candidate) => candidate.id !== operation.clipId);
        } else if (operation.kind === "reorder-clips") {
          const currentIds = new Set(draft.clips.map((clip) => clip.id));
          if (operation.clipIds.length !== draft.clips.length || operation.clipIds.some((id) => !currentIds.has(id)) || new Set(operation.clipIds).size !== operation.clipIds.length) {
            throw new Error("A reorder operation must contain every current clip exactly once.");
          }
          const byId = new Map(draft.clips.map((clip) => [clip.id, clip]));
          draft.clips = operation.clipIds.map((id) => byId.get(id)!);
        } else if (operation.kind === "set-clip-audio") {
          const clip = draft.clips.find((candidate) => candidate.id === operation.clipId);
          if (!clip || operation.volume < 0 || operation.volume > 1) throw new Error(`Invalid audio operation for clip ${operation.clipId}.`);
          clip.volume = operation.volume;
          clip.muted = operation.muted;
          clip.fadeInMs = Math.max(0, operation.fadeInMs);
          clip.fadeOutMs = Math.max(0, operation.fadeOutMs);
        } else if (operation.kind === "add-text") {
          if (operation.overlay.endMs <= operation.overlay.startMs || operation.overlay.startMs < 0 || operation.overlay.endMs > timelineDuration(draft.clips)) {
            throw new Error("Text overlay timing must stay within the current timeline.");
          }
          draft.overlays.push({ ...operation.overlay, id: crypto.randomUUID() });
        }
      }
      const draftPlan = draft.editPlans.find((candidate) => candidate.id === plan.id);
      if (draftPlan) {
        draftPlan.operations = draftPlan.operations.map((operation) => ({
          ...operation,
          status: operationIds.includes(operation.id) ? "accepted" : operation.status,
        }));
      }
    },
    selected.map((operation) => operation.id),
  );
}

export function formatTime(ms: number, includeMillis = false) {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const millis = Math.floor((safe % 1_000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${
    includeMillis ? `.${String(millis).padStart(2, "0")}` : ""
  }`;
}

export function isProjectManifest(value: unknown): value is ProjectManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectManifest>;
  return (
    candidate.schemaVersion === "videostitch.project.v1" &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.assets) &&
    Array.isArray(candidate.clips) &&
    Array.isArray(candidate.revisions)
  );
}
