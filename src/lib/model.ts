export type EditorialMode = "podcast" | "advertisement" | "product-demo" | "custom";
export type AspectRatio = "16:9" | "9:16" | "1:1";
export type VisualFit = "contain" | "cover";

export interface VisualTransform {
  fit: VisualFit;
  scale: number;
  positionX: number;
  positionY: number;
}

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
  transform: VisualTransform;
}

export interface BrollClip {
  id: string;
  assetId: string;
  name: string;
  timelineStartMs: number;
  sourceInMs: number;
  sourceOutMs: number;
  opacity: number;
  visualFadeInMs: number;
  visualFadeOutMs: number;
  transform: VisualTransform;
}

export interface TranscriptCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
  source: "imported";
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
  | ({ kind: "set-clip-transform"; clipId: string; transform: VisualTransform } & AiOperationBase)
  | ({ kind: "add-broll"; clip: Omit<BrollClip, "id"> } & AiOperationBase)
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
  brollClips: BrollClip[];
  transcript: TranscriptCue[];
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
    brollClips: [],
    transcript: [],
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
    transform: normalizeVisualTransform(clip.transform),
  }));
  normalized.brollClips = Array.isArray(normalized.brollClips)
    ? normalized.brollClips.map((clip) => ({
        ...clip,
        timelineStartMs: Math.max(0, clip.timelineStartMs ?? 0),
        opacity: typeof clip.opacity === "number" ? Math.min(1, Math.max(0, clip.opacity)) : 1,
        visualFadeInMs: clip.visualFadeInMs ?? 0,
        visualFadeOutMs: clip.visualFadeOutMs ?? 0,
        transform: normalizeVisualTransform(clip.transform, "cover"),
      }))
    : [];
  normalized.transcript = Array.isArray(normalized.transcript) ? normalized.transcript : [];
  normalized.overlays = Array.isArray(normalized.overlays) ? normalized.overlays : [];
  normalized.approvals = Array.isArray(normalized.approvals) ? normalized.approvals : [];
  return normalized;
}

export function defaultVisualTransform(fit: VisualFit = "contain"): VisualTransform {
  return { fit, scale: 1, positionX: 0, positionY: 0 };
}

function normalizeVisualTransform(transform: VisualTransform | undefined, fit: VisualFit = "contain"): VisualTransform {
  return {
    fit: transform?.fit === "cover" || transform?.fit === "contain" ? transform.fit : fit,
    scale: Math.min(3, Math.max(1, transform?.scale ?? 1)),
    positionX: Math.min(100, Math.max(-100, transform?.positionX ?? 0)),
    positionY: Math.min(100, Math.max(-100, transform?.positionY ?? 0)),
  };
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

export function brollDuration(clip: BrollClip): number {
  return Math.max(0, clip.sourceOutMs - clip.sourceInMs);
}

export function timelineDuration(clips: TimelineClip[]): number {
  return clips.reduce((total, clip) => total + clipDuration(clip), 0);
}

export function activeOverlays(project: ProjectManifest, timeMs: number) {
  return project.overlays.filter((overlay) => timeMs >= overlay.startMs && timeMs <= overlay.endMs);
}

export function activeBrollClips(project: ProjectManifest, timeMs: number) {
  return project.brollClips.filter((clip) => {
    const endMs = clip.timelineStartMs + brollDuration(clip);
    return timeMs >= clip.timelineStartMs && timeMs < endMs;
  });
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

function spliceTimedInterval(startMs: number, endMs: number, cutStartMs: number, cutEndMs: number) {
  const removedMs = cutEndMs - cutStartMs;
  if (endMs <= cutStartMs) return { startMs, endMs };
  if (startMs >= cutEndMs) return { startMs: startMs - removedMs, endMs: endMs - removedMs };
  if (startMs >= cutStartMs && endMs <= cutEndMs) return null;
  if (startMs < cutStartMs && endMs > cutEndMs) return { startMs, endMs: endMs - removedMs };
  if (startMs < cutStartMs) return { startMs, endMs: cutStartMs };
  return { startMs: cutStartMs, endMs: endMs - removedMs };
}

/** Removes a master-timeline range and ripples dependent V2, text, and transcript timing. */
export function removeTimelineRange(project: ProjectManifest, startMs: number, endMs: number, summary?: string) {
  const durationMs = timelineDuration(project.clips);
  const cutStartMs = Math.max(0, Math.min(durationMs, Math.round(startMs)));
  const cutEndMs = Math.max(cutStartMs, Math.min(durationMs, Math.round(endMs)));
  if (cutEndMs <= cutStartMs) return project;

  return commitRevision(project, summary ?? `Removed ${formatTime(cutEndMs - cutStartMs, true)} from transcript`, (draft) => {
    mutateRemoveTimelineRange(draft, cutStartMs, cutEndMs);
  });
}

/** Mutating form for composing several validated ripple cuts into one revision. */
export function mutateRemoveTimelineRange(draft: ProjectManifest, startMs: number, endMs: number) {
    const durationMs = timelineDuration(draft.clips);
    const cutStartMs = Math.max(0, Math.min(durationMs, Math.round(startMs)));
    const cutEndMs = Math.max(cutStartMs, Math.min(durationMs, Math.round(endMs)));
    if (cutEndMs <= cutStartMs) return;
    const nextClips: TimelineClip[] = [];
    let cursorMs = 0;
    for (const clip of draft.clips) {
      const duration = clipDuration(clip);
      const clipStartMs = cursorMs;
      const clipEndMs = cursorMs + duration;
      cursorMs = clipEndMs;
      if (clipEndMs <= cutStartMs || clipStartMs >= cutEndMs) {
        nextClips.push(clip);
        continue;
      }
      const leftDurationMs = Math.max(0, cutStartMs - clipStartMs);
      const rightDurationMs = Math.max(0, clipEndMs - cutEndMs);
      if (leftDurationMs > 0) {
        nextClips.push({ ...clip, sourceOutMs: clip.sourceInMs + leftDurationMs });
      }
      if (rightDurationMs > 0) {
        nextClips.push({
          ...clip,
          id: leftDurationMs > 0 ? crypto.randomUUID() : clip.id,
          name: leftDurationMs > 0 ? `${clip.name} · B` : clip.name,
          sourceInMs: clip.sourceOutMs - rightDurationMs,
        });
      }
    }
    draft.clips = nextClips;

    const nextBroll: BrollClip[] = [];
    for (const clip of draft.brollClips) {
      const clipStartMs = clip.timelineStartMs;
      const clipEndMs = clipStartMs + brollDuration(clip);
      if (clipEndMs <= cutStartMs) {
        nextBroll.push(clip);
      } else if (clipStartMs >= cutEndMs) {
        nextBroll.push({ ...clip, timelineStartMs: clipStartMs - (cutEndMs - cutStartMs) });
      } else if (clipStartMs < cutStartMs && clipEndMs > cutEndMs) {
        const leftDurationMs = cutStartMs - clipStartMs;
        nextBroll.push({ ...clip, sourceOutMs: clip.sourceInMs + leftDurationMs });
        nextBroll.push({
          ...clip,
          id: crypto.randomUUID(),
          name: `${clip.name} · B`,
          timelineStartMs: cutStartMs,
          sourceInMs: clip.sourceInMs + (cutEndMs - clipStartMs),
        });
      } else if (clipStartMs < cutStartMs) {
        nextBroll.push({ ...clip, sourceOutMs: clip.sourceInMs + (cutStartMs - clipStartMs) });
      } else if (clipEndMs > cutEndMs) {
        nextBroll.push({
          ...clip,
          timelineStartMs: cutStartMs,
          sourceInMs: clip.sourceInMs + (cutEndMs - clipStartMs),
        });
      }
    }
    draft.brollClips = nextBroll.filter((clip) => brollDuration(clip) > 0);

    draft.overlays = draft.overlays.flatMap((overlay) => {
      const timing = spliceTimedInterval(overlay.startMs, overlay.endMs, cutStartMs, cutEndMs);
      return timing && timing.endMs > timing.startMs ? [{ ...overlay, ...timing }] : [];
    });
    draft.transcript = draft.transcript.flatMap((cue) => {
      const timing = spliceTimedInterval(cue.startMs, cue.endMs, cutStartMs, cutEndMs);
      return timing && timing.endMs > timing.startMs ? [{ ...cue, ...timing }] : [];
    });
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
            mutateRemoveTimelineRange(draft, 0, operation.amountMs);
          }
        } else if (operation.kind === "trim-end") {
          const last = draft.clips.at(-1);
          if (last && clipDuration(last) > operation.amountMs + 500) {
            const total = timelineDuration(draft.clips);
            mutateRemoveTimelineRange(draft, total - operation.amountMs, total);
          }
        } else if (operation.kind === "set-aspect") {
          draft.canvas = dimensionsForRatio(operation.ratio);
        } else if (operation.kind === "trim-clip") {
          const clip = draft.clips.find((candidate) => candidate.id === operation.clipId);
          const asset = clip ? draft.assets.find((candidate) => candidate.id === clip.assetId) : null;
          if (!clip || !asset || operation.sourceInMs < clip.sourceInMs || operation.sourceOutMs > clip.sourceOutMs || operation.sourceOutMs - operation.sourceInMs < 500) {
            throw new Error(`Invalid trim operation for clip ${operation.clipId}.`);
          }
          let timelineStartMs = 0;
          for (const candidate of draft.clips) {
            if (candidate.id === clip.id) break;
            timelineStartMs += clipDuration(candidate);
          }
          if (operation.sourceOutMs < clip.sourceOutMs) {
            mutateRemoveTimelineRange(
              draft,
              timelineStartMs + operation.sourceOutMs - clip.sourceInMs,
              timelineStartMs + clipDuration(clip),
            );
          }
          if (operation.sourceInMs > clip.sourceInMs) {
            mutateRemoveTimelineRange(draft, timelineStartMs, timelineStartMs + operation.sourceInMs - clip.sourceInMs);
          }
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
          let timelineStartMs = 0;
          const clip = draft.clips.find((candidate) => {
            if (candidate.id === operation.clipId) return true;
            timelineStartMs += clipDuration(candidate);
            return false;
          });
          if (!clip) throw new Error(`Unknown clip ${operation.clipId}.`);
          mutateRemoveTimelineRange(draft, timelineStartMs, timelineStartMs + clipDuration(clip));
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
        } else if (operation.kind === "set-clip-transform") {
          const clip = draft.clips.find((candidate) => candidate.id === operation.clipId);
          if (!clip) throw new Error(`Unknown clip ${operation.clipId}.`);
          clip.transform = normalizeVisualTransform(operation.transform);
        } else if (operation.kind === "add-broll") {
          const asset = draft.assets.find((candidate) => candidate.id === operation.clip.assetId);
          const endMs = operation.clip.timelineStartMs + operation.clip.sourceOutMs - operation.clip.sourceInMs;
          if (!asset || operation.clip.sourceInMs < 0 || operation.clip.sourceOutMs > asset.durationMs || operation.clip.sourceOutMs <= operation.clip.sourceInMs || endMs > timelineDuration(draft.clips)) {
            throw new Error(`Invalid B-roll operation for asset ${operation.clip.assetId}.`);
          }
          draft.brollClips.push({
            ...operation.clip,
            id: crypto.randomUUID(),
            opacity: Math.min(1, Math.max(0, operation.clip.opacity)),
            transform: normalizeVisualTransform(operation.clip.transform, "cover"),
          });
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
