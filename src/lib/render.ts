import { activeOverlays, clipDuration, timelineDuration, type ProjectManifest, type TextOverlay, type TimelineClip } from "./model";
import fixWebmDuration from "fix-webm-duration";

export interface RenderPreflight {
  supported: boolean;
  mimeType: string | null;
  extension: "webm";
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  estimatedBytes: number;
  warnings: string[];
}

export interface RenderProgress {
  progress: number;
  renderedMs: number;
  totalMs: number;
  clipIndex: number;
  clipCount: number;
}

const MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function outputDimensions(project: ProjectManifest) {
  if (project.canvas.ratio === "9:16") return { width: 720, height: 1280 };
  if (project.canvas.ratio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1280, height: 720 };
}

export function inspectLocalRender(project: ProjectManifest): RenderPreflight {
  const mimeType = typeof MediaRecorder === "undefined"
    ? null
    : MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
  const { width, height } = outputDimensions(project);
  const durationMs = timelineDuration(project.clips);
  const estimatedBitrate = 6_000_000;
  const warnings: string[] = [];
  if (!project.clips.length) warnings.push("Add at least one video clip.");
  if (durationMs > 10 * 60_000) warnings.push("Long exports run in real time and should keep this tab visible.");
  if (!mimeType) warnings.push("This browser does not expose a compatible WebM recorder.");
  if (project.assets.some((asset) => !["video/mp4", "video/webm"].includes(asset.mimeType))) {
    warnings.push("One or more source codecs may not decode in this browser.");
  }
  return {
    supported: Boolean(mimeType && project.clips.length),
    mimeType,
    extension: "webm",
    width,
    height,
    fps: 30,
    durationMs,
    estimatedBytes: Math.ceil((durationMs / 1_000) * (estimatedBitrate / 8)),
    warnings,
  };
}

function waitForEvent(target: EventTarget, eventName: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Render cancelled.", "AbortError"));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      signal.removeEventListener("abort", onAbort);
    };
    target.addEventListener(eventName, onEvent, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function drawVideo(context: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number, opacity = 1) {
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  const sourceRatio = video.videoWidth / video.videoHeight;
  const outputRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (sourceRatio > outputRatio) drawHeight = width / sourceRatio;
  else drawWidth = height * sourceRatio;
  context.save();
  context.globalAlpha = opacity;
  context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
}

function clipOpacity(clip: TimelineClip, elapsedMs: number) {
  const duration = clipDuration(clip);
  let opacity = 1;
  if (clip.visualFadeInMs > 0) opacity *= Math.min(1, elapsedMs / clip.visualFadeInMs);
  if (clip.visualFadeOutMs > 0) opacity *= Math.min(1, (duration - elapsedMs) / clip.visualFadeOutMs);
  return Math.max(0, Math.min(1, opacity));
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function drawOverlay(context: CanvasRenderingContext2D, overlay: TextOverlay, width: number, height: number) {
  const scale = width / 1920;
  const fontSize = Math.max(24, overlay.fontSize * scale);
  const lineHeight = fontSize * 1.18;
  context.font = `700 ${fontSize}px Manrope, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lines = wrapLines(context, overlay.text, width * .78);
  const blockHeight = lines.length * lineHeight;
  const centerY = overlay.position === "top" ? height * .14 : overlay.position === "center" ? height * .5 : height * .84;
  if (overlay.background) {
    const textWidth = Math.max(...lines.map((line) => context.measureText(line).width), 1);
    const paddingX = fontSize * .48;
    const paddingY = fontSize * .3;
    context.fillStyle = "rgba(12, 12, 11, .78)";
    context.beginPath();
    context.roundRect(
      (width - textWidth) / 2 - paddingX,
      centerY - blockHeight / 2 - paddingY,
      textWidth + paddingX * 2,
      blockHeight + paddingY * 2,
      fontSize * .18,
    );
    context.fill();
  }
  context.fillStyle = overlay.color;
  lines.forEach((line, index) => {
    const y = centerY - blockHeight / 2 + lineHeight * (index + .5);
    context.fillText(line, width / 2, y);
  });
}

function clipGain(clip: TimelineClip, elapsedMs: number) {
  if (clip.muted) return 0;
  const duration = clipDuration(clip);
  let gain = clip.volume;
  if (clip.fadeInMs > 0) gain *= Math.min(1, elapsedMs / clip.fadeInMs);
  if (clip.fadeOutMs > 0) gain *= Math.min(1, (duration - elapsedMs) / clip.fadeOutMs);
  return Math.max(0, Math.min(1, gain));
}

export async function renderProjectLocally(options: {
  project: ProjectManifest;
  assetUrls: Record<string, string>;
  signal: AbortSignal;
  onProgress: (progress: RenderProgress) => void;
}) {
  const { project, assetUrls, signal, onProgress } = options;
  const preflight = inspectLocalRender(project);
  if (!preflight.supported || !preflight.mimeType) throw new Error(preflight.warnings[0] ?? "Local rendering is unavailable.");
  const missing = project.clips.find((clip) => !assetUrls[clip.assetId]);
  if (missing) throw new Error(`Relink ${missing.name} before rendering.`);

  const canvas = document.createElement("canvas");
  canvas.width = preflight.width;
  canvas.height = preflight.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas rendering is unavailable.");

  const canvasStream = canvas.captureStream(preflight.fps);
  const audioContext = new AudioContext();
  await audioContext.resume();
  const audioDestination = audioContext.createMediaStreamDestination();
  const outputStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ]);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(outputStream, {
    mimeType: preflight.mimeType,
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 160_000,
  });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  recorder.start(1_000);

  let timelineMs = 0;
  let failure: unknown = null;
  try {
    for (let clipIndex = 0; clipIndex < project.clips.length; clipIndex += 1) {
      if (signal.aborted) throw new DOMException("Render cancelled.", "AbortError");
      const clip = project.clips[clipIndex];
      const video = document.createElement("video");
      video.src = assetUrls[clip.assetId];
      video.preload = "auto";
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      if (video.readyState < 1) await waitForEvent(video, "loadedmetadata", signal);
      video.currentTime = clip.sourceInMs / 1_000;
      await waitForEvent(video, "seeked", signal);
      const source = audioContext.createMediaElementSource(video);
      const gain = audioContext.createGain();
      source.connect(gain).connect(audioDestination);
      try {
        await video.play();

        while (video.currentTime * 1_000 < clip.sourceOutMs) {
          if (signal.aborted) throw new DOMException("Render cancelled.", "AbortError");
          const elapsedMs = Math.max(0, video.currentTime * 1_000 - clip.sourceInMs);
          gain.gain.value = clipGain(clip, elapsedMs);
          drawVideo(context, video, preflight.width, preflight.height, clipOpacity(clip, elapsedMs));
          for (const overlay of activeOverlays(project, timelineMs + elapsedMs)) {
            drawOverlay(context, overlay, preflight.width, preflight.height);
          }
          const renderedMs = Math.min(preflight.durationMs, timelineMs + elapsedMs);
          onProgress({
            progress: preflight.durationMs ? renderedMs / preflight.durationMs : 0,
            renderedMs,
            totalMs: preflight.durationMs,
            clipIndex,
            clipCount: project.clips.length,
          });
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      } finally {
        video.pause();
        video.removeAttribute("src");
        video.load();
        source.disconnect();
        gain.disconnect();
      }
      timelineMs += clipDuration(clip);
    }
    onProgress({ progress: 1, renderedMs: preflight.durationMs, totalMs: preflight.durationMs, clipIndex: project.clips.length - 1, clipCount: project.clips.length });
  } catch (error) {
    failure = error;
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    canvasStream.getTracks().forEach((track) => track.stop());
    outputStream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
  }

  if (failure) throw failure;
  const rawBlob = new Blob(chunks, { type: preflight.mimeType });
  return fixWebmDuration(rawBlob, preflight.durationMs, { logger: false });
}
