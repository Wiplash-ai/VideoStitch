import { normalizeProject, type ProjectManifest } from "./model";

const DATABASE_NAME = "videostitch-local-v1";
const DATABASE_VERSION = 1;
const LAST_PROJECT_KEY = "videostitch:last-project";

interface StoredAsset {
  id: string;
  blob: Blob;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("projects")) {
        database.createObjectStore("projects", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("assets")) {
        database.createObjectStore("assets", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local project storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage request failed."));
  });
}

export async function saveProject(project: ProjectManifest) {
  const database = await openDatabase();
  const transaction = database.transaction("projects", "readwrite");
  await requestResult(transaction.objectStore("projects").put(project));
  localStorage.setItem(LAST_PROJECT_KEY, project.id);
  database.close();
}

export async function loadLastProject(): Promise<ProjectManifest | null> {
  const projectId = localStorage.getItem(LAST_PROJECT_KEY);
  if (!projectId) return null;
  const database = await openDatabase();
  const transaction = database.transaction("projects", "readonly");
  const project = await requestResult<ProjectManifest | undefined>(
    transaction.objectStore("projects").get(projectId),
  );
  database.close();
  return project ? normalizeProject(project) : null;
}

export async function listProjects(): Promise<ProjectManifest[]> {
  const database = await openDatabase();
  const transaction = database.transaction("projects", "readonly");
  const projects = await requestResult<ProjectManifest[]>(transaction.objectStore("projects").getAll());
  database.close();
  return projects
    .map(normalizeProject)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function loadProject(id: string): Promise<ProjectManifest | null> {
  const database = await openDatabase();
  const transaction = database.transaction("projects", "readonly");
  const project = await requestResult<ProjectManifest | undefined>(transaction.objectStore("projects").get(id));
  database.close();
  if (!project) return null;
  localStorage.setItem(LAST_PROJECT_KEY, id);
  return normalizeProject(project);
}

export async function deleteProject(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction("projects", "readwrite");
  await requestResult(transaction.objectStore("projects").delete(id));
  database.close();
  if (localStorage.getItem(LAST_PROJECT_KEY) === id) localStorage.removeItem(LAST_PROJECT_KEY);
}

export async function saveAsset(id: string, blob: Blob) {
  const database = await openDatabase();
  const transaction = database.transaction("assets", "readwrite");
  await requestResult(transaction.objectStore("assets").put({ id, blob } satisfies StoredAsset));
  database.close();
}

export async function loadAsset(id: string): Promise<Blob | null> {
  const database = await openDatabase();
  const transaction = database.transaction("assets", "readonly");
  const asset = await requestResult<StoredAsset | undefined>(transaction.objectStore("assets").get(id));
  database.close();
  return asset?.blob ?? null;
}

export async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function probeVideo(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{ durationMs: number; width: number; height: number }>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () =>
        resolve({
          durationMs: Math.round(video.duration * 1_000),
          width: video.videoWidth,
          height: video.videoHeight,
        });
      video.onerror = () => reject(new Error("This browser could not read that video's metadata."));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
