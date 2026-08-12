import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Captions,
  Check,
  ChevronDown,
  Clock3,
  CloudOff,
  Download,
  FileJson as FileJsonIcon,
  Film,
  FolderOpen,
  GripVertical,
  History,
  Keyboard,
  LayoutPanelTop,
  LoaderCircle,
  Menu,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  ShieldCheck,
  Sparkles,
  Type,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyAiOperations,
  activeOverlays,
  clipAtTime,
  clipDuration,
  commitRevision,
  createEmptyProject,
  createFixturePlan,
  dimensionsForRatio,
  formatTime,
  isProjectManifest,
  normalizeProject,
  timelineDuration,
  type ProjectManifest,
  type TimelineClip,
  type TextOverlay,
  type VideoAsset,
} from "./lib/model";
import { parseCaptionFile } from "./lib/captions";
import { operationSummary, validateEditPlan } from "./lib/editPlan";
import { inspectLocalRender, renderProjectLocally, type RenderPreflight, type RenderProgress } from "./lib/render";
import { HostedRunnerError, runHostedEditPlan, type HostedRunnerConfig, type HostedRunnerProgress } from "./lib/runnerClient";
import { deleteProject, listProjects, loadAsset, loadLastProject, loadProject, probeVideo, saveAsset, saveProject, sha256 } from "./lib/storage";

type SaveState = "loading" | "saved" | "saving" | "error";
type InspectorTab = "plan" | "clip" | "text" | "history";

interface RenderDialogState {
  open: boolean;
  status: "preflight" | "rendering" | "complete" | "error";
  preflight: RenderPreflight | null;
  progress: RenderProgress | null;
  error: string | null;
  outputUrl: string | null;
  outputSize: number;
  outputHash: string | null;
  qaPassed: boolean;
}

interface EditorHistory {
  snapshots: ProjectManifest[];
  cursor: number;
}

interface HostedAgentDialogState {
  open: boolean;
  status: "idle" | HostedRunnerProgress["status"] | "error";
  config: HostedRunnerConfig;
  instruction: string;
  jobId: string | null;
  error: string | null;
}

const clipColors: TimelineClip["color"][] = ["coral", "gold", "sage", "blue"];

function downloadJson(project: ProjectManifest) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project"}.vstitch.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function timelineEntries(clips: TimelineClip[]) {
  let cursor = 0;
  return clips.map((clip) => {
    const startMs = cursor;
    cursor += clipDuration(clip);
    return { clip, startMs, endMs: cursor };
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  return `${(bytes / 1_048_576).toFixed(bytes > 10_485_760 ? 0 : 1)} MB`;
}

async function hashBlob(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateRenderedVideo(url: string, expectedDurationMs: number) {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("The rendered file could not be reopened for QA.")), 10_000);
    video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); };
    video.onerror = () => { window.clearTimeout(timeout); reject(new Error("The rendered file failed browser playback QA.")); };
  });
  const durationMs = video.duration * 1_000;
  if (!Number.isFinite(durationMs) || Math.abs(durationMs - expectedDurationMs) > 1_000) {
    throw new Error("The rendered file duration did not match the approved timeline.");
  }
}

function App() {
  const [editor, setEditor] = useState<EditorHistory>({ snapshots: [], cursor: -1 });
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedOperations, setSelectedOperations] = useState<Set<string>>(new Set());
  const [planErrors, setPlanErrors] = useState<string[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("plan");
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectLibrary, setProjectLibrary] = useState<ProjectManifest[]>([]);
  const [draggedClipId, setDraggedClipId] = useState<string | null>(null);
  const [relinkAssetId, setRelinkAssetId] = useState<string | null>(null);
  const [renderDialog, setRenderDialog] = useState<RenderDialogState>({ open: false, status: "preflight", preflight: null, progress: null, error: null, outputUrl: null, outputSize: 0, outputHash: null, qaPassed: false });
  const [hostedAgentDialog, setHostedAgentDialog] = useState<HostedAgentDialogState>({
    open: false,
    status: "idle",
    config: { baseUrl: "http://localhost:8788", apiKey: "", sessionId: "", projectId: "" },
    instruction: "",
    jobId: null,
    error: null,
  });
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);
  const planInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const hostedAgentAbortRef = useRef<AbortController | null>(null);
  const playbackIntentRef = useRef(false);

  const project = editor.snapshots[editor.cursor] ?? null;
  const totalDuration = project ? timelineDuration(project.clips) : 0;
  const entries = useMemo(() => timelineEntries(project?.clips ?? []), [project?.clips]);
  const selectedClip = project?.clips.find((clip) => clip.id === selectedClipId) ?? project?.clips[0] ?? null;
  const selectedAsset = project?.assets.find((asset) => asset.id === selectedClip?.assetId) ?? null;
  const sourceUrl = selectedClip ? assetUrls[selectedClip.assetId] : undefined;
  const currentPlan = project?.editPlans.at(-1) ?? null;
  const selectedOverlay = project?.overlays.find((overlay) => overlay.id === selectedOverlayId) ?? null;
  const visibleOverlays = project ? activeOverlays(project, playheadMs) : [];
  const assetStorageKey = project?.assets.map((asset) => asset.id).join("|") ?? "";
  const canUndo = editor.cursor > 0;
  const canRedo = editor.cursor >= 0 && editor.cursor < editor.snapshots.length - 1;

  useEffect(() => {
    let active = true;
    void loadLastProject()
      .then((restored) => {
        if (!active) return;
        const initial = restored ?? createEmptyProject();
        setEditor({ snapshots: [initial], cursor: 0 });
        setSelectedClipId(initial.clips[0]?.id ?? null);
        setSaveState(restored ? "saved" : "saving");
      })
      .catch(() => {
        if (!active) return;
        setEditor({ snapshots: [createEmptyProject()], cursor: 0 });
        setSaveState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!project) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void saveProject(project)
        .then(() => {
          setSaveState("saved");
          return listProjects();
        })
        .then(setProjectLibrary)
        .catch(() => setSaveState("error"));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => () => {
    if (renderDialog.outputUrl) URL.revokeObjectURL(renderDialog.outputUrl);
  }, [renderDialog.outputUrl]);

  useEffect(() => () => {
    renderAbortRef.current?.abort();
    hostedAgentAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!project) return;
    let active = true;
    const urls: string[] = [];
    void Promise.all(
      project.assets.map(async (asset) => {
        const blob = await loadAsset(asset.id);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        return [asset.id, url] as const;
      }),
    ).then((pairs) => {
      if (!active) return;
      setAssetUrls(Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => pair !== null)));
    });
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [project?.id, assetStorageKey]);

  useEffect(() => {
    if (!project) return;
    if (!project.clips.some((clip) => clip.id === selectedClipId)) {
      setSelectedClipId(project.clips[0]?.id ?? null);
    }
    setPlayheadMs((time) => Math.min(time, timelineDuration(project.clips)));
  }, [project, selectedClipId]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 4_500);
  }, []);

  const pushSnapshot = useCallback((next: ProjectManifest) => {
    setEditor((current) => {
      const branch = current.snapshots.slice(0, current.cursor + 1);
      return { snapshots: [...branch, next], cursor: branch.length };
    });
  }, []);

  const replaceSnapshot = useCallback((next: ProjectManifest) => {
    setEditor((current) => {
      if (current.cursor < 0) return current;
      const snapshots = [...current.snapshots];
      snapshots[current.cursor] = next;
      return { ...current, snapshots };
    });
  }, []);

  const commit = useCallback(
    (summary: string, mutate: (draft: ProjectManifest) => void) => {
      if (!project) return;
      pushSnapshot(commitRevision(project, summary, mutate));
    },
    [project, pushSnapshot],
  );

  const importVideo = useCallback(
    async (file: File) => {
      if (!project) return;
      if (!file.type.startsWith("video/")) {
        showNotice("Choose an MP4 or WebM video file.");
        return;
      }
      setIsImporting(true);
      try {
        const [{ durationMs, width, height }, hash] = await Promise.all([probeVideo(file), sha256(file)]);
        const assetId = crypto.randomUUID();
        const clipId = crypto.randomUUID();
        const asset: VideoAsset = {
          id: assetId,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          durationMs,
          width,
          height,
          sha256: hash,
          importedAt: new Date().toISOString(),
        };
        await saveAsset(assetId, file);
        const next = commitRevision(project, `Imported ${file.name}`, (draft) => {
          draft.assets.push(asset);
          draft.clips.push({
            id: clipId,
            assetId,
            name: file.name.replace(/\.[^.]+$/, ""),
            sourceInMs: 0,
            sourceOutMs: durationMs,
            color: clipColors[draft.clips.length % clipColors.length],
            volume: 1,
            muted: false,
            fadeInMs: 0,
            fadeOutMs: 0,
            visualFadeInMs: 0,
            visualFadeOutMs: 0,
          });
          if (draft.name === "Untitled stitch") draft.name = file.name.replace(/\.[^.]+$/, "");
        });
        pushSnapshot(next);
        setSelectedClipId(clipId);
        setPlayheadMs(timelineDuration(project.clips));
        showNotice(`${file.name} is stored locally and ready to edit.`);
      } catch (error) {
        showNotice(error instanceof Error ? error.message : "Video import failed.");
      } finally {
        setIsImporting(false);
      }
    },
    [project, pushSnapshot, showNotice],
  );

  const onMediaInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void importVideo(file);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void importVideo(file);
  };

  const seekTo = useCallback(
    (timeMs: number) => {
      if (!project) return;
      const bounded = Math.max(0, Math.min(timeMs, totalDuration));
      setPlayheadMs(bounded);
      const located = clipAtTime(project.clips, bounded);
      if (!located) return;
      setSelectedClipId(located.clip.id);
      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = (located.clip.sourceInMs + located.offsetMs) / 1_000;
        }
      });
    },
    [project, totalDuration],
  );

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !project?.clips.length) return;
    if (!video.paused) {
      playbackIntentRef.current = false;
      video.pause();
      setIsPlaying(false);
      return;
    }
    const targetTime = playheadMs >= timelineDuration(project.clips) ? 0 : playheadMs;
    const located = clipAtTime(project.clips, targetTime) ?? clipAtTime(project.clips, 0);
    if (!located) return;
    playbackIntentRef.current = true;
    setPlayheadMs(targetTime);
    if (located.clip.id !== selectedClipId) {
      setSelectedClipId(located.clip.id);
      setIsPlaying(true);
      return;
    }
    setSelectedClipId(located.clip.id);
    video.currentTime = (located.clip.sourceInMs + located.offsetMs) / 1_000;
    void video.play().then(() => setIsPlaying(true)).catch(() => showNotice("Playback could not start."));
  }, [playheadMs, project, selectedClipId, showNotice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setEditor((current) => ({
          ...current,
          cursor: event.shiftKey
            ? Math.min(current.snapshots.length - 1, current.cursor + 1)
            : Math.max(0, current.cursor - 1),
        }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlayback]);

  const onVideoTime = () => {
    if (!videoRef.current || !selectedClip || !project) return;
    const sourceMs = videoRef.current.currentTime * 1_000;
    const entry = entries.find((candidate) => candidate.clip.id === selectedClip.id);
    if (!entry) return;
    const nextTime = entry.startMs + Math.max(0, sourceMs - selectedClip.sourceInMs);
    setPlayheadMs(Math.min(entry.endMs, nextTime));
    const elapsedMs = Math.max(0, sourceMs - selectedClip.sourceInMs);
    const remainingMs = Math.max(0, clipDuration(selectedClip) - elapsedMs);
    let previewVolume = selectedClip.muted ? 0 : selectedClip.volume;
    if (selectedClip.fadeInMs > 0) previewVolume *= Math.min(1, elapsedMs / selectedClip.fadeInMs);
    if (selectedClip.fadeOutMs > 0) previewVolume *= Math.min(1, remainingMs / selectedClip.fadeOutMs);
    videoRef.current.volume = Math.max(0, Math.min(1, previewVolume));
    let previewOpacity = 1;
    if (selectedClip.visualFadeInMs > 0) previewOpacity *= Math.min(1, elapsedMs / selectedClip.visualFadeInMs);
    if (selectedClip.visualFadeOutMs > 0) previewOpacity *= Math.min(1, remainingMs / selectedClip.visualFadeOutMs);
    videoRef.current.style.opacity = String(Math.max(0, Math.min(1, previewOpacity)));
    if (sourceMs >= selectedClip.sourceOutMs - 30) {
      videoRef.current.pause();
      const currentIndex = entries.findIndex((candidate) => candidate.clip.id === selectedClip.id);
      const next = entries[currentIndex + 1];
      if (next && playbackIntentRef.current) {
        setPlayheadMs(next.startMs);
        setSelectedClipId(next.clip.id);
        setIsPlaying(true);
      } else {
        playbackIntentRef.current = false;
        setIsPlaying(false);
        setPlayheadMs(entry.endMs);
      }
    }
  };

  const splitClip = () => {
    if (!project) return;
    const located = clipAtTime(project.clips, playheadMs);
    if (!located || located.offsetMs < 300 || clipDuration(located.clip) - located.offsetMs < 300) {
      showNotice("Move the playhead at least 0.3 seconds inside a clip to split it.");
      return;
    }
    const rightId = crypto.randomUUID();
    commit("Split clip", (draft) => {
      const index = draft.clips.findIndex((clip) => clip.id === located.clip.id);
      if (index < 0) return;
      const sourceSplit = located.clip.sourceInMs + located.offsetMs;
      const left = { ...draft.clips[index], sourceOutMs: sourceSplit };
      const right = {
        ...draft.clips[index],
        id: rightId,
        name: `${draft.clips[index].name} · B`,
        sourceInMs: sourceSplit,
        color: clipColors[(index + 1) % clipColors.length],
      };
      draft.clips.splice(index, 1, left, right);
    });
    setSelectedClipId(rightId);
  };

  const trimSelected = (edge: "start" | "end") => {
    if (!selectedClip) return;
    if (clipDuration(selectedClip) <= 1_000) {
      showNotice("A clip must remain at least half a second long.");
      return;
    }
    commit(`Trimmed clip ${edge}`, (draft) => {
      const clip = draft.clips.find((candidate) => candidate.id === selectedClip.id);
      if (!clip) return;
      if (edge === "start") clip.sourceInMs += 500;
      else clip.sourceOutMs -= 500;
    });
  };

  const deleteSelected = () => {
    if (!selectedClip) return;
    commit("Removed clip", (draft) => {
      draft.clips = draft.clips.filter((clip) => clip.id !== selectedClip.id);
    });
  };

  const generatePlan = () => {
    if (!project) return;
    const plan = createFixturePlan(project);
    if (!plan) {
      showNotice("Import at least two seconds of video before creating a plan.");
      return;
    }
    const next = structuredClone(project);
    next.editPlans.push(plan);
    next.updatedAt = new Date().toISOString();
    replaceSnapshot(next);
    setSelectedOperations(new Set(plan.operations.map((operation) => operation.id)));
    setInspectorTab("plan");
    showNotice("A fixture AI plan is ready for review. Nothing has been applied.");
  };

  const applySelectedPlan = () => {
    if (!project) return;
    try {
      const next = applyAiOperations(project, [...selectedOperations]);
      if (next === project) {
        showNotice("Select at least one proposal to apply.");
        return;
      }
      pushSnapshot(next);
      setSelectedOperations(new Set());
      showNotice("Selected proposals were applied as a new revision.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "The plan could not be applied.");
    }
  };

  const rejectPlan = () => {
    if (!project || !currentPlan) return;
    const next = structuredClone(project);
    const plan = next.editPlans.find((candidate) => candidate.id === currentPlan.id);
    if (plan) plan.operations = plan.operations.map((operation) => ({ ...operation, status: "rejected" }));
    replaceSnapshot(next);
    setSelectedOperations(new Set());
    showNotice("The proposals were rejected. The timeline is unchanged.");
  };

  const importManifest = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isProjectManifest(parsed)) throw new Error("That file is not a VideoStitch v1 project manifest.");
      const imported = normalizeProject(parsed);
      imported.id = crypto.randomUUID();
      imported.name = `${imported.name} (imported)`;
      imported.updatedAt = new Date().toISOString();
      setEditor({ snapshots: [imported], cursor: 0 });
      setSelectedClipId(imported.clips[0]?.id ?? null);
      setPlayheadMs(0);
      showNotice("Manifest imported. Relink any source media that is unavailable on this device.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Manifest import failed.");
    }
  };

  const stageEditPlan = (value: unknown, source: string) => {
    const result = validateEditPlan(value, project);
    if (!result.plan) {
      setPlanErrors(result.errors);
      setInspectorTab("plan");
      showNotice(`Plan rejected with ${result.errors.length} validation ${result.errors.length === 1 ? "error" : "errors"}.`);
      return false;
    }
    const next = structuredClone(project);
    next.editPlans.push(result.plan);
    next.updatedAt = new Date().toISOString();
    replaceSnapshot(next);
    setPlanErrors([]);
    setSelectedOperations(new Set(result.plan.operations.map((operation) => operation.id)));
    setInspectorTab("plan");
    showNotice(`${result.plan.operations.length} ${source} proposals are ready for review.`);
    return true;
  };

  const importEditPlan = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      stageEditPlan(value, "external agent");
    } catch (error) {
      setPlanErrors([error instanceof SyntaxError ? "The selected file is not valid JSON." : "The edit plan could not be read."]);
      setInspectorTab("plan");
      showNotice("The edit plan could not be imported.");
    }
  };

  const runHostedAgent = async () => {
    const controller = new AbortController();
    hostedAgentAbortRef.current = controller;
    setHostedAgentDialog((current) => ({ ...current, status: "submitting", jobId: null, error: null }));
    try {
      const plan = await runHostedEditPlan({
        config: hostedAgentDialog.config,
        project,
        instruction: hostedAgentDialog.instruction,
        signal: controller.signal,
        onProgress: (progress) => setHostedAgentDialog((current) => ({ ...current, status: progress.status, jobId: progress.jobId ?? current.jobId })),
      });
      if (stageEditPlan(plan, "hosted agent")) {
        setHostedAgentDialog((current) => ({ ...current, open: false, status: "idle", instruction: "", jobId: null, error: null }));
      }
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "Hosted edit cancelled."
        : error instanceof HostedRunnerError ? `${error.message} (${error.code})`
          : error instanceof Error ? error.message : "The hosted edit failed.";
      setHostedAgentDialog((current) => ({ ...current, status: "error", error: message }));
    } finally {
      hostedAgentAbortRef.current = null;
    }
  };

  const createProject = () => {
    const next = createEmptyProject();
    setEditor({ snapshots: [next], cursor: 0 });
    setSelectedClipId(null);
    setSelectedOverlayId(null);
    setPlayheadMs(0);
    setProjectMenuOpen(false);
    showNotice("New local project created.");
  };

  const openProject = async (projectId: string) => {
    const next = await loadProject(projectId);
    if (!next) {
      showNotice("That local project could not be opened.");
      return;
    }
    setEditor({ snapshots: [next], cursor: 0 });
    setSelectedClipId(next.clips[0]?.id ?? null);
    setSelectedOverlayId(null);
    setPlayheadMs(0);
    setProjectMenuOpen(false);
  };

  const removeProject = async (projectId: string) => {
    if (projectId === project.id) {
      showNotice("Open another project before deleting this one.");
      return;
    }
    await deleteProject(projectId);
    setProjectLibrary(await listProjects());
    showNotice("Local project removed.");
  };

  const duplicateCurrentProject = async () => {
    const duplicate = structuredClone(project);
    const timestamp = new Date().toISOString();
    duplicate.id = crypto.randomUUID();
    duplicate.name = `${project.name} copy`;
    duplicate.createdAt = timestamp;
    duplicate.updatedAt = timestamp;
    await saveProject(duplicate);
    setProjectLibrary(await listProjects());
    await openProject(duplicate.id);
    showNotice("Project duplicated with local media references intact.");
  };

  const relinkAsset = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !relinkAssetId) return;
    const asset = project.assets.find((candidate) => candidate.id === relinkAssetId);
    if (!asset) return;
    setIsImporting(true);
    try {
      const hash = await sha256(file);
      if (hash !== asset.sha256) throw new Error("That file does not match the original source fingerprint.");
      await saveAsset(asset.id, file);
      const url = URL.createObjectURL(file);
      setAssetUrls((current) => ({ ...current, [asset.id]: url }));
      showNotice(`${asset.name} relinked successfully.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Source relinking failed.");
    } finally {
      setIsImporting(false);
      setRelinkAssetId(null);
    }
  };

  const importCaptions = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const overlays = parseCaptionFile(await file.text(), totalDuration);
    if (!overlays.length) {
      showNotice("No valid SRT or WebVTT caption cues were found in that file.");
      return;
    }
    commit(`Imported ${overlays.length} caption cues`, (draft) => {
      draft.overlays.push(...overlays);
    });
    setSelectedOverlayId(overlays[0].id);
    setInspectorTab("text");
    showNotice(`${overlays.length} caption cues imported.`);
  };

  const moveClip = (clipId: string, direction: -1 | 1) => {
    const index = project.clips.findIndex((clip) => clip.id === clipId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= project.clips.length) return;
    commit("Reordered clips", (draft) => {
      const [clip] = draft.clips.splice(index, 1);
      draft.clips.splice(target, 0, clip);
    });
  };

  const dropClipBefore = (targetId: string) => {
    if (!draggedClipId || draggedClipId === targetId) return;
    const sourceIndex = project.clips.findIndex((clip) => clip.id === draggedClipId);
    const targetIndex = project.clips.findIndex((clip) => clip.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    commit("Reordered clips", (draft) => {
      const [clip] = draft.clips.splice(sourceIndex, 1);
      draft.clips.splice(targetIndex, 0, clip);
    });
    setDraggedClipId(null);
  };

  const updateClipDirect = (clipId: string, patch: Partial<TimelineClip>) => {
    const next = structuredClone(project);
    const clip = next.clips.find((candidate) => candidate.id === clipId);
    if (!clip) return;
    Object.assign(clip, patch);
    next.updatedAt = new Date().toISOString();
    replaceSnapshot(next);
  };

  const checkpointCurrentState = (summary: string) => {
    pushSnapshot(commitRevision(project, summary, () => undefined));
  };

  const commitClipBoundary = (edge: "sourceInMs" | "sourceOutMs", seconds: number) => {
    if (!selectedClip || !selectedAsset || !Number.isFinite(seconds)) return;
    const value = Math.round(seconds * 1_000);
    const valid = edge === "sourceInMs"
      ? value >= 0 && value <= selectedClip.sourceOutMs - 500
      : value >= selectedClip.sourceInMs + 500 && value <= selectedAsset.durationMs;
    if (!valid) {
      showNotice("Trim points must preserve at least half a second and stay within the source.");
      return;
    }
    commit(edge === "sourceInMs" ? "Adjusted clip in point" : "Adjusted clip out point", (draft) => {
      const clip = draft.clips.find((candidate) => candidate.id === selectedClip.id);
      if (clip) clip[edge] = value;
    });
  };

  const addOverlay = (kind: TextOverlay["kind"]) => {
    if (!totalDuration) {
      showNotice("Add video before creating text overlays.");
      return;
    }
    const id = crypto.randomUUID();
    const startMs = Math.min(playheadMs, Math.max(0, totalDuration - 500));
    const endMs = Math.min(totalDuration, startMs + (kind === "caption" ? 3_000 : 4_000));
    commit(`Added ${kind}`, (draft) => {
      draft.overlays.push({
        id,
        kind,
        text: kind === "caption" ? "Type your caption" : "Add a title",
        startMs,
        endMs: Math.max(startMs + 500, endMs),
        position: kind === "caption" ? "bottom" : "center",
        fontSize: kind === "caption" ? 56 : 82,
        color: "#ffffff",
        background: kind === "caption",
      });
    });
    setSelectedOverlayId(id);
    setInspectorTab("text");
  };

  const updateOverlayDirect = (overlayId: string, patch: Partial<TextOverlay>) => {
    const next = structuredClone(project);
    const overlay = next.overlays.find((candidate) => candidate.id === overlayId);
    if (!overlay) return;
    Object.assign(overlay, patch);
    next.updatedAt = new Date().toISOString();
    replaceSnapshot(next);
  };

  const removeOverlay = (overlayId: string) => {
    commit("Removed text overlay", (draft) => {
      draft.overlays = draft.overlays.filter((overlay) => overlay.id !== overlayId);
    });
    setSelectedOverlayId(null);
  };

  const openRenderDialog = () => {
    const preflight = inspectLocalRender(project);
    setRenderDialog({ open: true, status: "preflight", preflight, progress: null, error: null, outputUrl: null, outputSize: 0, outputHash: null, qaPassed: false });
  };

  const startLocalRender = async () => {
    const controller = new AbortController();
    renderAbortRef.current = controller;
    setRenderDialog((current) => ({ ...current, status: "rendering", progress: null, error: null }));
    try {
      const blob = await renderProjectLocally({
        project,
        assetUrls,
        signal: controller.signal,
        onProgress: (progress) => setRenderDialog((current) => ({ ...current, progress })),
      });
      const outputHash = await hashBlob(blob);
      const outputUrl = URL.createObjectURL(blob);
      try {
        await validateRenderedVideo(outputUrl, timelineDuration(project.clips));
      } catch (error) {
        URL.revokeObjectURL(outputUrl);
        throw error;
      }
      setRenderDialog((current) => ({ ...current, status: "complete", progress: current.progress, outputUrl, outputSize: blob.size, outputHash, qaPassed: true }));
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "Render cancelled. No partial file was saved."
        : error instanceof Error ? error.message : "Local render failed.";
      setRenderDialog((current) => ({ ...current, status: "error", error: message }));
    } finally {
      renderAbortRef.current = null;
    }
  };

  const downloadRender = () => {
    if (!renderDialog.outputUrl) return;
    const anchor = document.createElement("a");
    anchor.href = renderDialog.outputUrl;
    anchor.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "videostitch"}.webm`;
    anchor.click();
  };

  const approveAndDownloadRender = async () => {
    if (!renderDialog.outputHash || !renderDialog.preflight || !renderDialog.qaPassed) return;
    const timestamp = new Date().toISOString();
    const next = structuredClone(project);
    next.approvals.push({
      id: crypto.randomUUID(),
      revisionId: project.currentRevisionId,
      createdAt: timestamp,
      approvedAt: timestamp,
      sha256: renderDialog.outputHash,
      mimeType: renderDialog.preflight.mimeType ?? "video/webm",
      size: renderDialog.outputSize,
      durationMs: renderDialog.preflight.durationMs,
      width: renderDialog.preflight.width,
      height: renderDialog.preflight.height,
    });
    next.updatedAt = timestamp;
    replaceSnapshot(next);
    await saveProject(next);
    downloadRender();
    showNotice("Export approved and linked to the current revision.");
  };

  const onTimelineClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!totalDuration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    seekTo(((event.clientX - bounds.left) / bounds.width) * totalDuration);
  };

  if (!project) {
    return (
      <div className="boot-screen">
        <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
        <LoaderCircle className="spin" size={20} />
        <span>Opening local workspace</span>
      </div>
    );
  }

  return (
    <div className="app-shell" onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
      <input ref={mediaInputRef} className="visually-hidden" type="file" accept="video/mp4,video/webm,video/*" onChange={onMediaInput} />
      <input ref={manifestInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importManifest} />
      <input ref={planInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importEditPlan} />
      <input ref={captionInputRef} className="visually-hidden" type="file" accept=".srt,.vtt,text/plain,text/vtt" onChange={importCaptions} />
      <input ref={relinkInputRef} className="visually-hidden" type="file" accept="video/mp4,video/webm,video/*" onChange={relinkAsset} />

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
          <span>VideoStitch</span>
          <b>ALPHA</b>
        </div>
        <div className="project-identity">
          <button className="project-library-button" onClick={() => setProjectMenuOpen((open) => !open)} aria-expanded={projectMenuOpen}><FolderOpen /><span>Projects</span><ChevronDown /></button>
          <input
            aria-label="Project name"
            value={project.name}
            onChange={(event) => replaceSnapshot({ ...project, name: event.target.value, updatedAt: new Date().toISOString() })}
          />
          <span className={`save-state ${saveState}`}>
            {saveState === "saving" ? <LoaderCircle className="spin" /> : saveState === "error" ? <X /> : <Check />}
            {saveState === "error" ? "Local save failed" : saveState === "saving" ? "Saving locally" : "Saved locally"}
          </span>
          {projectMenuOpen && <div className="project-menu">
            <div className="project-menu-heading"><strong>Local projects</strong><button onClick={createProject}><Plus /> New</button></div>
            <div className="project-menu-list">
              {projectLibrary.map((candidate) => <div className={candidate.id === project.id ? "active" : ""} key={candidate.id}>
                <button onClick={() => void openProject(candidate.id)}><strong>{candidate.name}</strong><small>{candidate.clips.length} clips · {new Date(candidate.updatedAt).toLocaleDateString()}</small></button>
                {candidate.id !== project.id && <button className="project-delete" onClick={() => void removeProject(candidate.id)} aria-label={`Delete ${candidate.name}`}><Trash2 /></button>}
              </div>)}
            </div>
            <button className="manifest-menu-action" onClick={() => void duplicateCurrentProject()}><FileJsonIcon /> Duplicate current project</button>
            <button className="manifest-menu-action" onClick={() => { setProjectMenuOpen(false); manifestInputRef.current?.click(); }}><Upload /> Import project manifest</button>
            <button className="manifest-menu-action" onClick={() => { setProjectMenuOpen(false); planInputRef.current?.click(); }}><Sparkles /> Import agent edit plan</button>
          </div>}
        </div>
        <div className="top-actions">
          <button className="icon-button mobile-menu" aria-label="Open menu"><Menu /></button>
          <button className="quiet-button" onClick={() => downloadJson(project)}><FileJsonIcon /> Manifest</button>
          <button className="export-button" onClick={openRenderDialog}><ArrowDownToLine /> Export video</button>
          <button className="icon-button" aria-label="Create new project" onClick={createProject}><Plus /></button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="media-rail">
          <div className="rail-heading"><span>Project media</span><button aria-label="Import media" onClick={() => mediaInputRef.current?.click()}><Plus /></button></div>
          <button className="import-tile" onClick={() => mediaInputRef.current?.click()} disabled={isImporting}>
            {isImporting ? <LoaderCircle className="spin" /> : <FolderOpen />}
            <strong>{isImporting ? "Indexing video…" : "Import video"}</strong>
            <span>MP4 or WebM</span>
          </button>
          <div className="asset-list">
            {project.assets.map((asset) => (
              <button
                className={`asset-card ${selectedAsset?.id === asset.id ? "active" : ""} ${assetUrls[asset.id] ? "" : "missing"}`}
                key={asset.id}
                onClick={() => {
                  if (!assetUrls[asset.id]) {
                    setRelinkAssetId(asset.id);
                    window.setTimeout(() => relinkInputRef.current?.click());
                    return;
                  }
                  const clip = project.clips.find((candidate) => candidate.assetId === asset.id);
                  if (clip) setSelectedClipId(clip.id);
                }}
              >
                <span className="asset-thumb"><Film /><i>{asset.width}×{asset.height}</i></span>
                <span className="asset-copy"><strong>{asset.name}</strong><small>{assetUrls[asset.id] ? `${formatTime(asset.durationMs)} · ${(asset.size / 1_048_576).toFixed(1)} MB` : "Source missing · click to relink"}</small></span>
              </button>
            ))}
          </div>
          <div className="local-boundary">
            <ShieldCheck />
            <div><strong>Local workspace</strong><span>No source media leaves this browser.</span></div>
          </div>
        </aside>

        <main className="editor-stage">
          <div className="stage-toolbar">
            <div className="mode-switcher"><span>{project.editorialMode.replace("-", " ")}</span><ChevronDown /></div>
            <div className="tool-cluster">
              <button className="tool-button" disabled={!canUndo} onClick={() => setEditor((current) => ({ ...current, cursor: current.cursor - 1 }))} title="Undo (Ctrl/⌘ Z)"><Undo2 /> Undo</button>
              <button className="tool-button" disabled={!canRedo} onClick={() => setEditor((current) => ({ ...current, cursor: current.cursor + 1 }))} title="Redo (Ctrl/⌘ Shift Z)"><Redo2 /> Redo</button>
              <span className="toolbar-divider" />
              <button className="tool-button" disabled={!selectedClip} onClick={splitClip}><Scissors /> Split</button>
              <button className="tool-button" disabled={!selectedClip} onClick={() => trimSelected("start")}>[ Trim in</button>
              <button className="tool-button" disabled={!selectedClip} onClick={() => trimSelected("end")}>Trim out ]</button>
              <button className="tool-button danger" disabled={!selectedClip} onClick={deleteSelected}><Trash2 /> Remove</button>
              <span className="toolbar-divider" />
              <button className="tool-button" disabled={!project.clips.length} onClick={() => addOverlay("caption")}><Captions /> Caption</button>
              <button className="tool-button" disabled={!project.clips.length} onClick={() => addOverlay("title")}><Type /> Title</button>
            </div>
            <div className="canvas-switcher">
              {(["16:9", "9:16", "1:1"] as const).map((ratio) => (
                <button
                  key={ratio}
                  className={project.canvas.ratio === ratio ? "active" : ""}
                  onClick={() => commit(`Changed canvas to ${ratio}`, (draft) => { draft.canvas = dimensionsForRatio(ratio); })}
                >{ratio}</button>
              ))}
            </div>
          </div>

          <section className="preview-region">
            {sourceUrl ? (
              <div className={`video-matte ratio-${project.canvas.ratio.replace(":", "-")}`}>
                <video
                  ref={videoRef}
                  src={sourceUrl}
                  onTimeUpdate={onVideoTime}
                  onPause={() => { if (!playbackIntentRef.current) setIsPlaying(false); }}
                  onPlay={() => setIsPlaying(true)}
                  onLoadedMetadata={() => {
                    if (selectedClip && videoRef.current) {
                      const entry = entries.find((candidate) => candidate.clip.id === selectedClip.id);
                      const offsetMs = entry ? Math.max(0, playheadMs - entry.startMs) : 0;
                      videoRef.current.currentTime = (selectedClip.sourceInMs + offsetMs) / 1_000;
                      videoRef.current.volume = selectedClip.muted ? 0 : selectedClip.volume;
                      if (playbackIntentRef.current) void videoRef.current.play().catch(() => {
                        playbackIntentRef.current = false;
                        setIsPlaying(false);
                        showNotice("Playback could not continue into the next clip.");
                      });
                    }
                  }}
                  playsInline
                />
                <div className="preview-overlays" aria-live="off">
                  {visibleOverlays.map((overlay) => <button
                    key={overlay.id}
                    className={`preview-overlay ${overlay.kind} ${overlay.position} ${overlay.background ? "with-background" : ""}`}
                    style={{ color: overlay.color, fontSize: `${Math.max(16, overlay.fontSize * .42)}px` }}
                    onClick={() => { setSelectedOverlayId(overlay.id); setInspectorTab("text"); }}
                  >{overlay.text}</button>)}
                </div>
                <button className="preview-play" onClick={togglePlayback} aria-label={isPlaying ? "Pause preview" : "Play preview"}>
                  {isPlaying ? <Pause /> : <Play fill="currentColor" />}
                </button>
                <div className="preview-badge"><CloudOff /> Local preview</div>
              </div>
            ) : (
              <button className={`empty-stage ${isDragging ? "dragging" : ""}`} onClick={() => mediaInputRef.current?.click()}>
                <span className="empty-icon"><Film /><Plus /></span>
                <strong>Drop your first cut here</strong>
                <p>Import an MP4 or WebM. It stays in this browser and remains immutable.</p>
                <i>Choose video</i>
              </button>
            )}
          </section>

          <section className="transport-bar" aria-label="Playback controls">
            <div className="transport-left"><button className="icon-button" onClick={() => seekTo(0)} aria-label="Go to beginning"><span className="skip-start">|◀</span></button><button className="transport-play" onClick={togglePlayback} disabled={!sourceUrl}>{isPlaying ? <Pause /> : <Play fill="currentColor" />}</button><time>{formatTime(playheadMs, true)}</time><span>/</span><time className="muted">{formatTime(totalDuration, true)}</time></div>
            <div className="transport-center"><span>{project.canvas.width} × {project.canvas.height}</span><i /> <span>{project.canvas.ratio}</span></div>
            <div className="zoom-control"><button onClick={() => setZoom((value) => Math.max(.75, value - .25))} aria-label="Zoom out"><ZoomOut /></button><div><span style={{ width: `${((zoom - .75) / 1.25) * 100}%` }} /></div><button onClick={() => setZoom((value) => Math.min(2, value + .25))} aria-label="Zoom in"><ZoomIn /></button></div>
          </section>

          <section className="timeline-panel">
            <div className="timeline-header">
              <div><strong>Timeline</strong><span>{project.clips.length} {project.clips.length === 1 ? "clip" : "clips"} · revision {project.revisions.length}</span></div>
              <div><Keyboard /> Space to play · click to seek</div>
            </div>
            <div className="timeline-scroll">
              <div className="timeline-canvas" style={{ minWidth: `${Math.max(100, zoom * 100)}%` }}>
                <div className="time-ruler">
                  {[0, .25, .5, .75, 1].map((point) => <span key={point} style={{ left: `${point * 100}%` }}>{formatTime(totalDuration * point)}</span>)}
                </div>
                <div className="track-row"><div className="track-label"><Film /><span>V1</span></div><div className="clip-track" onClick={onTimelineClick}>
                  {entries.map(({ clip }) => (
                    <button
                      key={clip.id}
                      draggable
                      className={`timeline-clip ${clip.color} ${selectedClip?.id === clip.id ? "selected" : ""}`}
                      style={{ width: `${totalDuration ? (clipDuration(clip) / totalDuration) * 100 : 0}%` }}
                      onClick={(event) => {
                        event.stopPropagation();
                        const entry = entries.find((candidate) => candidate.clip.id === clip.id);
                        setSelectedClipId(clip.id);
                        setInspectorTab("clip");
                        if (entry) seekTo(entry.startMs);
                      }}
                      onDragStart={() => setDraggedClipId(clip.id)}
                      onDragEnd={() => setDraggedClipId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => { event.preventDefault(); dropClipBefore(clip.id); }}
                    >
                      <GripVertical className="clip-grip" />
                      <span className="clip-filmstrip" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</span>
                      <strong>{clip.name}</strong><small>{formatTime(clipDuration(clip), true)}</small>
                    </button>
                  ))}
                  {!entries.length && <button className="empty-track" onClick={() => mediaInputRef.current?.click()}><Plus /> Add media to begin</button>}
                  <div className="playhead" style={{ left: `${totalDuration ? (playheadMs / totalDuration) * 100 : 0}%` }}><i /></div>
                </div></div>
                <div className="track-row audio-row"><div className="track-label"><LayoutPanelTop /><span>A1</span></div><div className="audio-track" onClick={onTimelineClick}>{project.clips.length > 0 && <div className="waveform" aria-hidden="true">{Array.from({ length: 84 }, (_, index) => <i key={index} style={{ height: `${20 + ((index * 37) % 72)}%` }} />)}</div>}</div></div>
                <div className="track-row text-row"><div className="track-label"><Captions /><span>TXT</span></div><div className="text-track" onClick={onTimelineClick}>
                  {project.overlays.map((overlay) => <button
                    key={overlay.id}
                    className={`overlay-clip ${selectedOverlayId === overlay.id ? "selected" : ""}`}
                    style={{ left: `${totalDuration ? (overlay.startMs / totalDuration) * 100 : 0}%`, width: `${totalDuration ? ((overlay.endMs - overlay.startMs) / totalDuration) * 100 : 0}%` }}
                    onClick={(event) => { event.stopPropagation(); setSelectedOverlayId(overlay.id); setInspectorTab("text"); seekTo(overlay.startMs); }}
                  ><Type /> <span>{overlay.text}</span></button>)}
                </div></div>
              </div>
            </div>
          </section>
        </main>

        <aside className="inspector">
          <div className="inspector-tabs">
            <button className={inspectorTab === "plan" ? "active" : ""} onClick={() => setInspectorTab("plan")}><Sparkles /> AI</button>
            <button className={inspectorTab === "clip" ? "active" : ""} onClick={() => setInspectorTab("clip")}><Film /> Clip</button>
            <button className={inspectorTab === "text" ? "active" : ""} onClick={() => setInspectorTab("text")}><Type /> Text</button>
            <button className={inspectorTab === "history" ? "active" : ""} onClick={() => setInspectorTab("history")}><History /> History</button>
          </div>
          {inspectorTab === "plan" ? (
            <div className="plan-pane">
              <div className="plan-intro">
                <span className="agent-orb"><BrainCircuit /></span>
                <div><strong>{currentPlan?.name ?? "AI edit plan"}</strong><small>{currentPlan ? currentPlan.provenance : "Review before anything changes"}</small></div>
              </div>
              {planErrors.length > 0 && <div className="plan-errors"><div><X /><strong>Plan validation failed</strong></div><ol>{planErrors.map((error) => <li key={error}>{error}</li>)}</ol><button onClick={() => setPlanErrors([])}>Dismiss</button></div>}
              {!currentPlan ? (
                <div className="plan-empty">
                  <WandSparkles />
                  <h2>Let AI suggest the first stitch.</h2>
                  <p>Generate a safe fixture plan from your current timeline. It proposes changes without touching the edit.</p>
                  <div className="plan-empty-actions"><button onClick={() => setHostedAgentDialog((current) => ({ ...current, open: true, status: "idle", error: null }))} disabled={!project.clips.length}><BrainCircuit /> Hosted agent</button><button className="secondary" onClick={() => planInputRef.current?.click()} disabled={!project.clips.length}><Upload /> Import plan</button><button className="secondary" onClick={generatePlan} disabled={!project.clips.length}><Sparkles /> Try fixture</button></div>
                  <small>Use your private-beta runner, or export the manifest and bring a plan back from any capable agent.</small>
                </div>
              ) : (
                <>
                  <div className="plan-meta"><span><Clock3 /> {new Date(currentPlan.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span>Base rev {project.revisions.find((revision) => revision.id === currentPlan.baseRevisionId)?.number ?? "stale"}</span></div>
                  <div className="plan-goal"><span>Viewer goal</span><p>{currentPlan.viewerGoal}</p>{currentPlan.uncertainties.length > 0 && <small>{currentPlan.uncertainties.length} {currentPlan.uncertainties.length === 1 ? "uncertainty" : "uncertainties"} declared</small>}</div>
                  <div className="proposal-list">
                    {currentPlan.operations.map((operation) => {
                      const checked = selectedOperations.has(operation.id);
                      return (
                        <label className={`proposal-card ${operation.status}`} key={operation.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={operation.status !== "proposed"}
                            onChange={() => setSelectedOperations((current) => {
                              const next = new Set(current);
                              if (next.has(operation.id)) next.delete(operation.id); else next.add(operation.id);
                              return next;
                            })}
                          />
                          <span className="proposal-check">{operation.status === "accepted" ? <Check /> : operation.status === "rejected" ? <X /> : checked ? <Check /> : null}</span>
                          <span className="proposal-copy"><strong>{operation.title}</strong><small>{operationSummary(operation)}</small><p>{operation.rationale}</p><i className={`confidence ${operation.confidence}`}>{operation.confidence} confidence</i></span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="plan-safety"><ShieldCheck /><span><strong>Nothing changes automatically.</strong> Applying creates a new revision you can undo.</span></div>
                  <div className="plan-actions"><button className="reject-button" onClick={rejectPlan}>Reject all</button><button className="apply-button" onClick={applySelectedPlan} disabled={!selectedOperations.size}><Check /> Apply {selectedOperations.size || "selected"}</button></div>
                  <div className="plan-refresh-actions"><button className="regenerate-button" onClick={() => setHostedAgentDialog((current) => ({ ...current, open: true, status: "idle", error: null }))}><BrainCircuit /> Ask hosted agent</button><button className="regenerate-button" onClick={() => planInputRef.current?.click()}><Upload /> Import another plan</button></div>
                </>
              )}
            </div>
          ) : inspectorTab === "clip" ? (
            <div className="property-pane">
              {selectedClip && selectedAsset ? <>
                <div className="property-heading"><span className={`property-color ${selectedClip.color}`} /><div><strong>{selectedClip.name}</strong><small>{selectedAsset.name} · {formatTime(clipDuration(selectedClip), true)}</small></div></div>
                <section className="property-section">
                  <div className="property-label"><span>Source timing</span><small>seconds</small></div>
                  <div className="timing-grid">
                    <label>In<input key={`${selectedClip.id}-in-${selectedClip.sourceInMs}`} type="number" min="0" max={selectedClip.sourceOutMs / 1_000 - .5} step="0.01" defaultValue={(selectedClip.sourceInMs / 1_000).toFixed(2)} onBlur={(event) => commitClipBoundary("sourceInMs", event.currentTarget.valueAsNumber)} /></label>
                    <label>Out<input key={`${selectedClip.id}-out-${selectedClip.sourceOutMs}`} type="number" min={selectedClip.sourceInMs / 1_000 + .5} max={selectedAsset.durationMs / 1_000} step="0.01" defaultValue={(selectedClip.sourceOutMs / 1_000).toFixed(2)} onBlur={(event) => commitClipBoundary("sourceOutMs", event.currentTarget.valueAsNumber)} /></label>
                  </div>
                  <div className="nudge-row"><button onClick={() => trimSelected("start")}>Nudge in +0.5s</button><button onClick={() => trimSelected("end")}>Nudge out −0.5s</button></div>
                </section>
                <section className="property-section">
                  <div className="property-label"><span>Audio</span><small>{selectedClip.muted ? "Muted" : `${Math.round(selectedClip.volume * 100)}%`}</small></div>
                  <div className="volume-row"><button className={selectedClip.muted ? "active" : ""} onClick={() => commit(selectedClip.muted ? "Unmuted clip" : "Muted clip", (draft) => { const clip = draft.clips.find((candidate) => candidate.id === selectedClip.id); if (clip) clip.muted = !clip.muted; })}>{selectedClip.muted ? <VolumeX /> : <Volume2 />}</button><input aria-label="Clip volume" type="range" min="0" max="1" step="0.01" value={selectedClip.volume} onChange={(event) => updateClipDirect(selectedClip.id, { volume: event.currentTarget.valueAsNumber })} onPointerUp={() => checkpointCurrentState("Adjusted clip volume")} /></div>
                  <div className="timing-grid">
                    <label>Fade in<input type="number" min="0" max={clipDuration(selectedClip) / 1_000} step="0.1" value={(selectedClip.fadeInMs / 1_000).toFixed(1)} onChange={(event) => updateClipDirect(selectedClip.id, { fadeInMs: Math.max(0, event.currentTarget.valueAsNumber * 1_000) })} onBlur={() => checkpointCurrentState("Adjusted audio fade in")} /></label>
                    <label>Fade out<input type="number" min="0" max={clipDuration(selectedClip) / 1_000} step="0.1" value={(selectedClip.fadeOutMs / 1_000).toFixed(1)} onChange={(event) => updateClipDirect(selectedClip.id, { fadeOutMs: Math.max(0, event.currentTarget.valueAsNumber * 1_000) })} onBlur={() => checkpointCurrentState("Adjusted audio fade out")} /></label>
                  </div>
                </section>
                <section className="property-section">
                  <div className="property-label"><span>Sequence</span><small>Drag on timeline</small></div>
                  <div className="sequence-actions"><button disabled={project.clips[0]?.id === selectedClip.id} onClick={() => moveClip(selectedClip.id, -1)}><ArrowLeft /> Earlier</button><button disabled={project.clips.at(-1)?.id === selectedClip.id} onClick={() => moveClip(selectedClip.id, 1)}>Later <ArrowRight /></button></div>
                </section>
                <section className="property-section">
                  <div className="property-label"><span>Visual fades</span><small>Dip through black</small></div>
                  <div className="timing-grid">
                    <label>Fade in<input type="number" min="0" max={clipDuration(selectedClip) / 1_000} step="0.1" value={(selectedClip.visualFadeInMs / 1_000).toFixed(1)} onChange={(event) => updateClipDirect(selectedClip.id, { visualFadeInMs: Math.max(0, event.currentTarget.valueAsNumber * 1_000) })} onBlur={() => checkpointCurrentState("Adjusted visual fade in")} /></label>
                    <label>Fade out<input type="number" min="0" max={clipDuration(selectedClip) / 1_000} step="0.1" value={(selectedClip.visualFadeOutMs / 1_000).toFixed(1)} onChange={(event) => updateClipDirect(selectedClip.id, { visualFadeOutMs: Math.max(0, event.currentTarget.valueAsNumber * 1_000) })} onBlur={() => checkpointCurrentState("Adjusted visual fade out")} /></label>
                  </div>
                </section>
                <section className="source-proof"><ShieldCheck /><div><strong>Immutable source</strong><span>{selectedAsset.sha256.slice(0, 12)}… · {(selectedAsset.size / 1_048_576).toFixed(1)} MB</span></div></section>
                <button className="destructive-action" onClick={deleteSelected}><Trash2 /> Remove clip from timeline</button>
              </> : <div className="inspector-empty"><Film /><strong>Select a timeline clip</strong><p>Precise trim, audio, fades, and sequence controls will appear here.</p></div>}
            </div>
          ) : inspectorTab === "text" ? (
            <div className="text-pane">
              <div className="text-actions"><button onClick={() => addOverlay("caption")}><Captions /> Caption</button><button onClick={() => addOverlay("title")}><Type /> Title</button><button onClick={() => captionInputRef.current?.click()}><Upload /> SRT/VTT</button></div>
              {project.overlays.length > 0 && <div className="overlay-list">{project.overlays.map((overlay) => <button key={overlay.id} className={overlay.id === selectedOverlayId ? "active" : ""} onClick={() => { setSelectedOverlayId(overlay.id); seekTo(overlay.startMs); }}><span>{overlay.kind === "caption" ? <Captions /> : <Type />}</span><div><strong>{overlay.text}</strong><small>{formatTime(overlay.startMs, true)}–{formatTime(overlay.endMs, true)}</small></div></button>)}</div>}
              {selectedOverlay ? <div className="overlay-properties">
                <label className="stacked-field">Text<textarea value={selectedOverlay.text} rows={3} onChange={(event) => updateOverlayDirect(selectedOverlay.id, { text: event.currentTarget.value })} onBlur={() => checkpointCurrentState(`Edited ${selectedOverlay.kind} text`)} /></label>
                <div className="timing-grid"><label>Start<input type="number" min="0" max={selectedOverlay.endMs / 1_000 - .1} step="0.1" value={(selectedOverlay.startMs / 1_000).toFixed(1)} onChange={(event) => updateOverlayDirect(selectedOverlay.id, { startMs: Math.max(0, event.currentTarget.valueAsNumber * 1_000) })} onBlur={() => checkpointCurrentState(`Adjusted ${selectedOverlay.kind} timing`)} /></label><label>End<input type="number" min={selectedOverlay.startMs / 1_000 + .1} max={totalDuration / 1_000} step="0.1" value={(selectedOverlay.endMs / 1_000).toFixed(1)} onChange={(event) => updateOverlayDirect(selectedOverlay.id, { endMs: Math.min(totalDuration, event.currentTarget.valueAsNumber * 1_000) })} onBlur={() => checkpointCurrentState(`Adjusted ${selectedOverlay.kind} timing`)} /></label></div>
                <div className="property-label"><span>Position</span></div>
                <div className="segmented-control">{(["top", "center", "bottom"] as const).map((position) => <button className={selectedOverlay.position === position ? "active" : ""} key={position} onClick={() => commit(`Moved ${selectedOverlay.kind}`, (draft) => { const overlay = draft.overlays.find((candidate) => candidate.id === selectedOverlay.id); if (overlay) overlay.position = position; })}>{position}</button>)}</div>
                <label className="range-field"><span>Size <small>{selectedOverlay.fontSize}px</small></span><input type="range" min="28" max="120" value={selectedOverlay.fontSize} onChange={(event) => updateOverlayDirect(selectedOverlay.id, { fontSize: event.currentTarget.valueAsNumber })} onPointerUp={() => checkpointCurrentState(`Resized ${selectedOverlay.kind}`)} /></label>
                <div className="overlay-style-row"><label>Color<input type="color" value={selectedOverlay.color} onChange={(event) => updateOverlayDirect(selectedOverlay.id, { color: event.currentTarget.value })} onBlur={() => checkpointCurrentState(`Recolored ${selectedOverlay.kind}`)} /></label><label className="check-field"><input type="checkbox" checked={selectedOverlay.background} onChange={(event) => commit(`Changed ${selectedOverlay.kind} background`, (draft) => { const overlay = draft.overlays.find((candidate) => candidate.id === selectedOverlay.id); if (overlay) overlay.background = event.currentTarget.checked; })} /><span><Check /></span>Background</label></div>
                <button className="destructive-action" onClick={() => removeOverlay(selectedOverlay.id)}><Trash2 /> Remove {selectedOverlay.kind}</button>
              </div> : <div className="inspector-empty compact"><Type /><strong>Add text to the cut</strong><p>Captions and titles are visible in preview and included in local exports.</p></div>}
            </div>
          ) : (
            <div className="history-pane">
              <div className="history-heading"><strong>Revision history</strong><span>Local snapshots</span></div>
              <ol>
                {[...project.revisions].reverse().map((revision, reverseIndex) => {
                  const active = revision.id === project.currentRevisionId;
                  return <li className={active ? "active" : ""} key={revision.id}><span>{project.revisions.length - reverseIndex}</span><div><strong>{revision.summary}</strong><small>{new Date(revision.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {revision.operationIds.length ? `${revision.operationIds.length} AI ops` : "manual"}</small></div>{active && <i>current</i>}</li>;
                })}
              </ol>
              {project.approvals.length > 0 && <div className="approval-list"><strong>Approved exports</strong>{[...project.approvals].reverse().map((approval) => <article key={approval.id}><ShieldCheck /><div><b>{approval.width} × {approval.height} WebM</b><small>{formatBytes(approval.size)} · rev {project.revisions.find((revision) => revision.id === approval.revisionId)?.number ?? "?"}</small><code>{approval.sha256.slice(0, 16)}…</code></div></article>)}</div>}
              <div className="history-note"><History /><p>Undo and redo move through this browser session. The latest project revision is also persisted in IndexedDB.</p></div>
            </div>
          )}
        </aside>
      </div>

      {isDragging && <div className="drop-overlay"><Download /><strong>Drop to add this video</strong><span>It will be stored only in this browser.</span></div>}
      {renderDialog.open && <div className="modal-backdrop" role="presentation">
        <section className="render-dialog" role="dialog" aria-modal="true" aria-labelledby="render-title">
          <header><div><span className="render-mark"><Film /></span><div><h2 id="render-title">Local video export</h2><p>Rendered entirely in this browser</p></div></div><button disabled={renderDialog.status === "rendering"} onClick={() => setRenderDialog((current) => ({ ...current, open: false }))} aria-label="Close export dialog"><X /></button></header>
          {renderDialog.status === "preflight" && renderDialog.preflight && <>
            <div className="render-summary">
              <div><span>Format</span><strong>WebM</strong></div><div><span>Output</span><strong>{renderDialog.preflight.width} × {renderDialog.preflight.height}</strong></div><div><span>Frame rate</span><strong>{renderDialog.preflight.fps} fps</strong></div><div><span>Duration</span><strong>{formatTime(renderDialog.preflight.durationMs, true)}</strong></div><div><span>Estimated size</span><strong>~{formatBytes(renderDialog.preflight.estimatedBytes)}</strong></div><div><span>Media</span><strong>Local only</strong></div>
            </div>
            <div className="render-notice"><Clock3 /><div><strong>Real-time browser export</strong><p>Keep this tab visible while VideoStitch plays and records the approved timeline. Audio fades and text overlays are included.</p></div></div>
            {renderDialog.preflight.warnings.length > 0 && <ul className="render-warnings">{renderDialog.preflight.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            <footer><button className="cancel-button" onClick={() => setRenderDialog((current) => ({ ...current, open: false }))}>Not yet</button><button className="render-button" disabled={!renderDialog.preflight.supported} onClick={() => void startLocalRender()}><Film /> Start local export</button></footer>
          </>}
          {renderDialog.status === "rendering" && <div className="render-running">
            <span className="render-spinner"><LoaderCircle className="spin" /></span><h3>Stitching your video</h3><p>Clip {(renderDialog.progress?.clipIndex ?? 0) + 1} of {renderDialog.progress?.clipCount ?? project.clips.length} · {formatTime(renderDialog.progress?.renderedMs ?? 0)} / {formatTime(renderDialog.progress?.totalMs ?? totalDuration)}</p><div className="render-progress"><span style={{ width: `${(renderDialog.progress?.progress ?? 0) * 100}%` }} /></div><strong>{Math.round((renderDialog.progress?.progress ?? 0) * 100)}%</strong><button onClick={() => renderAbortRef.current?.abort()}>Cancel render</button>
          </div>}
          {renderDialog.status === "complete" && <div className="render-complete">
            <span><Check /></span><h3>Export ready for review</h3><p>{formatTime(totalDuration, true)} · {formatBytes(renderDialog.outputSize)} · WebM</p>{renderDialog.outputUrl && <video src={renderDialog.outputUrl} controls playsInline />}<small className="render-qa"><ShieldCheck /> Playback and duration QA passed</small><small className="render-hash">SHA-256 {renderDialog.outputHash?.slice(0, 16)}… · revision {project.revisions.find((revision) => revision.id === project.currentRevisionId)?.number}</small><div className="render-complete-actions"><button className="cancel-button" onClick={downloadRender}><Download /> Download draft</button><button className="render-button" disabled={!renderDialog.qaPassed} onClick={() => void approveAndDownloadRender()}><ShieldCheck /> Approve & download</button></div><button className="text-button" onClick={() => setRenderDialog((current) => ({ ...current, open: false }))}>Return to editor</button>
          </div>}
          {renderDialog.status === "error" && <div className="render-error"><span><X /></span><h3>Export did not finish</h3><p>{renderDialog.error}</p><div><button className="cancel-button" onClick={() => setRenderDialog((current) => ({ ...current, open: false }))}>Close</button><button className="render-button" onClick={() => { setRenderDialog((current) => ({ ...current, status: "preflight", error: null })); }}>Try again</button></div></div>}
        </section>
      </div>}
      {hostedAgentDialog.open && <div className="modal-backdrop" role="presentation">
        <section className="agent-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-dialog-title">
          <header><div><span className="render-mark"><BrainCircuit /></span><div><h2 id="agent-dialog-title">Hosted Codex edit</h2><p>Private beta · customer-authenticated runner</p></div></div><button disabled={["submitting", "queued", "running"].includes(hostedAgentDialog.status)} onClick={() => setHostedAgentDialog((current) => ({ ...current, open: false }))} aria-label="Close hosted agent dialog"><X /></button></header>
          <div className="agent-boundary"><ShieldCheck /><div><strong>Only this project manifest is sent.</strong><p>Your source video stays in the browser. The agent returns proposed JSON operations and nothing is applied automatically.</p></div></div>
          <div className="agent-form">
            <label><span>Runner URL</span><input type="url" value={hostedAgentDialog.config.baseUrl} placeholder="http://localhost:8788" autoComplete="url" onChange={(event) => setHostedAgentDialog((current) => ({ ...current, config: { ...current.config, baseUrl: event.target.value } }))} /></label>
            <label><span>API key</span><input type="password" value={hostedAgentDialog.config.apiKey} placeholder="vst_test_…" autoComplete="off" onChange={(event) => setHostedAgentDialog((current) => ({ ...current, config: { ...current.config, apiKey: event.target.value } }))} /><small>Held in memory only; never stored in the project.</small></label>
            <div className="agent-id-grid"><label><span>Session ID</span><input value={hostedAgentDialog.config.sessionId} placeholder="ses_…" autoComplete="off" onChange={(event) => setHostedAgentDialog((current) => ({ ...current, config: { ...current.config, sessionId: event.target.value } }))} /></label><label><span>Hosted project ID</span><input value={hostedAgentDialog.config.projectId} placeholder="prj_…" autoComplete="off" onChange={(event) => setHostedAgentDialog((current) => ({ ...current, config: { ...current.config, projectId: event.target.value } }))} /></label></div>
            <label><span>Editing brief</span><textarea rows={5} value={hostedAgentDialog.instruction} placeholder="Tighten the first 15 seconds, preserve the product reveal, and add a concise bottom caption." onChange={(event) => setHostedAgentDialog((current) => ({ ...current, instruction: event.target.value }))} /></label>
          </div>
          {hostedAgentDialog.error && <div className="agent-error"><X /><span>{hostedAgentDialog.error}</span></div>}
          {["submitting", "queued", "running", "succeeded"].includes(hostedAgentDialog.status) && <div className="agent-progress"><LoaderCircle className="spin" /><div><strong>{hostedAgentDialog.status === "submitting" ? "Submitting project manifest" : hostedAgentDialog.status === "queued" ? "Waiting for the private runner" : hostedAgentDialog.status === "running" ? "Codex is proposing edits" : "Validating the edit plan"}</strong><small>{hostedAgentDialog.jobId ? `Job ${hostedAgentDialog.jobId}` : "Establishing the project-scoped request"}</small></div></div>}
          <footer><button className="cancel-button" onClick={() => { if (hostedAgentAbortRef.current) hostedAgentAbortRef.current.abort(); else setHostedAgentDialog((current) => ({ ...current, open: false })); }}>{["submitting", "queued", "running"].includes(hostedAgentDialog.status) ? "Cancel job" : "Not yet"}</button><button className="render-button" disabled={!hostedAgentDialog.instruction.trim() || ["submitting", "queued", "running"].includes(hostedAgentDialog.status)} onClick={() => void runHostedAgent()}><BrainCircuit /> Propose edits</button></footer>
        </section>
      </div>}
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X /></button></div>}
    </div>
  );
}

export default App;
