import { timelineDuration, type AiOperation, type EditPlan, type ProjectManifest, type TextOverlay } from "./model";

export interface PlanValidationResult {
  plan: EditPlan | null;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function validateCommon(operation: Record<string, unknown>, index: number, errors: string[]) {
  for (const key of ["id", "kind", "title", "detail", "rationale"] as const) {
    if (!isString(operation[key])) errors.push(`operations[${index}].${key} must be a non-empty string.`);
  }
  if (!["high", "medium", "low"].includes(String(operation.confidence))) {
    errors.push(`operations[${index}].confidence must be high, medium, or low.`);
  }
  if (operation.status !== "proposed") errors.push(`operations[${index}].status must be proposed on import.`);
}

function validateOverlay(value: unknown, index: number, durationMs: number, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`operations[${index}].overlay must be an object.`);
    return;
  }
  if (!["caption", "title"].includes(String(value.kind))) errors.push(`operations[${index}].overlay.kind is invalid.`);
  if (!isString(value.text)) errors.push(`operations[${index}].overlay.text is required.`);
  if (!isInteger(value.startMs) || !isInteger(value.endMs) || Number(value.startMs) < 0 || Number(value.endMs) <= Number(value.startMs) || Number(value.endMs) > durationMs) {
    errors.push(`operations[${index}].overlay timing must use integer milliseconds inside the timeline.`);
  }
  if (!["top", "center", "bottom"].includes(String(value.position))) errors.push(`operations[${index}].overlay.position is invalid.`);
  if (!isInteger(value.fontSize) || Number(value.fontSize) < 28 || Number(value.fontSize) > 120) errors.push(`operations[${index}].overlay.fontSize must be 28-120.`);
  if (!isString(value.color) || !/^#[0-9a-f]{6}$/i.test(String(value.color))) errors.push(`operations[${index}].overlay.color must be a hex color.`);
  if (typeof value.background !== "boolean") errors.push(`operations[${index}].overlay.background must be boolean.`);
}

function validateTransform(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (!["contain", "cover"].includes(String(value.fit))) errors.push(`${path}.fit must be contain or cover.`);
  if (typeof value.scale !== "number" || value.scale < 1 || value.scale > 3) errors.push(`${path}.scale must be between 1 and 3.`);
  if (typeof value.positionX !== "number" || value.positionX < -100 || value.positionX > 100) errors.push(`${path}.positionX must be between -100 and 100.`);
  if (typeof value.positionY !== "number" || value.positionY < -100 || value.positionY > 100) errors.push(`${path}.positionY must be between -100 and 100.`);
}

export function validateEditPlan(value: unknown, project: ProjectManifest): PlanValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { plan: null, errors: ["The edit plan must be a JSON object."] };
  if (value.schemaVersion !== "videostitch.edit-plan.v1") errors.push("schemaVersion must be videostitch.edit-plan.v1.");
  for (const key of ["id", "baseRevisionId", "name", "createdAt", "provenance", "viewerGoal"] as const) {
    if (!isString(value[key])) errors.push(`${key} must be a non-empty string.`);
  }
  if (value.baseRevisionId !== project.currentRevisionId) errors.push("baseRevisionId does not match the current project revision.");
  if (value.sourceCoordinateSystem !== "source-milliseconds") errors.push("sourceCoordinateSystem must be source-milliseconds.");
  if (!Array.isArray(value.uncertainties) || value.uncertainties.some((item) => typeof item !== "string")) errors.push("uncertainties must be an array of strings.");
  if (!Array.isArray(value.protectedBeats) || value.protectedBeats.some((item) => typeof item !== "string")) errors.push("protectedBeats must be an array of strings.");
  if (!Array.isArray(value.operations) || !value.operations.length) {
    errors.push("operations must contain at least one operation.");
    return { plan: null, errors };
  }

  const clipIds = new Set(project.clips.map((clip) => clip.id));
  const clipsById = new Map(project.clips.map((clip) => [clip.id, clip]));
  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const operationIds = new Set<string>();
  const durationMs = timelineDuration(project.clips);
  value.operations.forEach((rawOperation, index) => {
    if (!isRecord(rawOperation)) {
      errors.push(`operations[${index}] must be an object.`);
      return;
    }
    validateCommon(rawOperation, index, errors);
    if (isString(rawOperation.id)) {
      if (operationIds.has(rawOperation.id)) errors.push(`operations[${index}].id must be unique.`);
      operationIds.add(rawOperation.id);
    }
    const kind = rawOperation.kind;
    if (["trim-start", "trim-end"].includes(String(kind))) {
      if (!isInteger(rawOperation.amountMs) || Number(rawOperation.amountMs) <= 0) errors.push(`operations[${index}].amountMs must be a positive integer.`);
    } else if (kind === "set-aspect") {
      if (!["16:9", "9:16", "1:1"].includes(String(rawOperation.ratio))) errors.push(`operations[${index}].ratio is invalid.`);
    } else if (kind === "trim-clip") {
      if (!clipIds.has(String(rawOperation.clipId))) errors.push(`operations[${index}].clipId is unknown.`);
      if (!isInteger(rawOperation.sourceInMs) || !isInteger(rawOperation.sourceOutMs) || Number(rawOperation.sourceOutMs) - Number(rawOperation.sourceInMs) < 500) errors.push(`operations[${index}] has invalid trim coordinates.`);
      const clip = clipsById.get(String(rawOperation.clipId));
      if (clip && (Number(rawOperation.sourceInMs) < clip.sourceInMs || Number(rawOperation.sourceOutMs) > clip.sourceOutMs)) errors.push(`operations[${index}] may trim inward only; use undo to restore removed source.`);
    } else if (kind === "split-clip") {
      if (!clipIds.has(String(rawOperation.clipId))) errors.push(`operations[${index}].clipId is unknown.`);
      if (!isInteger(rawOperation.sourceTimeMs)) errors.push(`operations[${index}].sourceTimeMs must be an integer.`);
    } else if (kind === "remove-clip") {
      if (!clipIds.has(String(rawOperation.clipId))) errors.push(`operations[${index}].clipId is unknown.`);
    } else if (kind === "reorder-clips") {
      if (!Array.isArray(rawOperation.clipIds) || rawOperation.clipIds.length !== project.clips.length || rawOperation.clipIds.some((id) => !clipIds.has(String(id))) || new Set(rawOperation.clipIds).size !== project.clips.length) errors.push(`operations[${index}].clipIds must contain every current clip exactly once.`);
    } else if (kind === "set-clip-audio") {
      if (!clipIds.has(String(rawOperation.clipId))) errors.push(`operations[${index}].clipId is unknown.`);
      if (typeof rawOperation.volume !== "number" || rawOperation.volume < 0 || rawOperation.volume > 1) errors.push(`operations[${index}].volume must be between 0 and 1.`);
      if (typeof rawOperation.muted !== "boolean" || !isInteger(rawOperation.fadeInMs) || !isInteger(rawOperation.fadeOutMs)) errors.push(`operations[${index}] has invalid audio settings.`);
    } else if (kind === "set-clip-transform") {
      if (!clipIds.has(String(rawOperation.clipId))) errors.push(`operations[${index}].clipId is unknown.`);
      validateTransform(rawOperation.transform, `operations[${index}].transform`, errors);
    } else if (kind === "add-broll") {
      if (!isRecord(rawOperation.clip)) {
        errors.push(`operations[${index}].clip must be an object.`);
      } else {
        const clip = rawOperation.clip;
        const asset = assetsById.get(String(clip.assetId));
        if (!asset) errors.push(`operations[${index}].clip.assetId is unknown.`);
        if (!isString(clip.name)) errors.push(`operations[${index}].clip.name is required.`);
        if (!isInteger(clip.timelineStartMs) || !isInteger(clip.sourceInMs) || !isInteger(clip.sourceOutMs) || Number(clip.timelineStartMs) < 0 || Number(clip.sourceInMs) < 0 || Number(clip.sourceOutMs) <= Number(clip.sourceInMs) || Number(clip.timelineStartMs) + Number(clip.sourceOutMs) - Number(clip.sourceInMs) > durationMs || (asset && Number(clip.sourceOutMs) > asset.durationMs)) errors.push(`operations[${index}].clip timing must stay within the source and timeline.`);
        if (typeof clip.opacity !== "number" || clip.opacity < 0 || clip.opacity > 1 || !isInteger(clip.visualFadeInMs) || !isInteger(clip.visualFadeOutMs)) errors.push(`operations[${index}].clip blend settings are invalid.`);
        validateTransform(clip.transform, `operations[${index}].clip.transform`, errors);
      }
    } else if (kind === "add-text") {
      validateOverlay(rawOperation.overlay, index, durationMs, errors);
    } else {
      errors.push(`operations[${index}].kind is unsupported.`);
    }
  });

  if (errors.length) return { plan: null, errors };
  return { plan: value as unknown as EditPlan, errors: [] };
}

export function operationSummary(operation: AiOperation) {
  if (operation.kind === "trim-clip") return `Trim ${operation.clipId} to ${operation.sourceInMs}-${operation.sourceOutMs}ms`;
  if (operation.kind === "split-clip") return `Split ${operation.clipId} at ${operation.sourceTimeMs}ms`;
  if (operation.kind === "remove-clip") return `Remove ${operation.clipId}`;
  if (operation.kind === "reorder-clips") return `Reorder ${operation.clipIds.length} clips`;
  if (operation.kind === "set-clip-audio") return `${operation.muted ? "Mute" : `Set ${Math.round(operation.volume * 100)}% volume on`} ${operation.clipId}`;
  if (operation.kind === "set-clip-transform") return `${operation.transform.fit} ${operation.clipId} at ${operation.transform.scale.toFixed(2)}×`;
  if (operation.kind === "add-broll") return `Add ${operation.clip.name} to V2 at ${operation.clip.timelineStartMs}ms`;
  if (operation.kind === "add-text") return `Add ${operation.overlay.kind} at ${operation.overlay.startMs}-${operation.overlay.endMs}ms`;
  return operation.detail;
}
