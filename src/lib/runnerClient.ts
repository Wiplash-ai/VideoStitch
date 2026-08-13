import type { EditPlan, ProjectManifest } from "./model";

export interface HostedRunnerConfig {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
  projectId: string;
}

export interface HostedRunnerProgress {
  status: "submitting" | "queued" | "running" | "succeeded";
  jobId?: string;
}

interface RunnerJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  error_code?: string | null;
}

export class HostedRunnerError extends Error {
  constructor(
    message: string,
    public readonly code = "runner_error",
    public readonly status = 0,
  ) {
    super(message);
  }
}

function endpoint(config: HostedRunnerConfig, path: string) {
  return `${config.baseUrl.trim().replace(/\/+$/, "")}${path}`;
}

async function request<T>(
  config: HostedRunnerConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint(config, path), {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
        ...init.headers,
      },
    });
  } catch (error) {
    if (init.signal?.aborted) throw new DOMException("The hosted edit was cancelled.", "AbortError");
    throw new HostedRunnerError(
      error instanceof Error ? `Runner connection failed: ${error.message}` : "Runner connection failed.",
      "connection_failed",
    );
  }
  if (!response.ok) {
    let code = "runner_error";
    let message = `Runner request failed with status ${response.status}.`;
    try {
      const payload = (await response.json()) as { detail?: { code?: string; message?: string } | string };
      if (typeof payload.detail === "object") {
        code = payload.detail.code || code;
        message = payload.detail.message || message;
      } else if (typeof payload.detail === "string") {
        message = payload.detail;
      }
    } catch {
      // Preserve the stable fallback without surfacing raw proxy responses.
    }
    throw new HostedRunnerError(message, code, response.status);
  }
  return (await response.json()) as T;
}

function assertConfig(config: HostedRunnerConfig) {
  if (!/^https?:\/\//.test(config.baseUrl.trim())) throw new HostedRunnerError("Enter a valid HTTP or HTTPS runner URL.", "invalid_runner_url");
  if (!config.apiKey.trim()) throw new HostedRunnerError("Enter your VideoStitch API key.", "api_key_required");
  if (!config.sessionId.trim()) throw new HostedRunnerError("Enter the hosted Codex session ID.", "session_id_required");
  if (!config.projectId.trim()) throw new HostedRunnerError("Enter the hosted project ID.", "project_id_required");
}

export async function runHostedEditPlan(options: {
  config: HostedRunnerConfig;
  project: ProjectManifest;
  instruction: string;
  signal?: AbortSignal;
  onProgress?: (progress: HostedRunnerProgress) => void;
  pollMs?: number;
}): Promise<EditPlan> {
  const { config, project, signal, onProgress } = options;
  assertConfig(config);
  const instruction = options.instruction.trim();
  if (!instruction) throw new HostedRunnerError("Describe the edit you want the agent to propose.", "instruction_required");
  onProgress?.({ status: "submitting" });
  const idempotencyKey = `web-${project.id}-${project.currentRevisionId}-${crypto.randomUUID()}`;
  const job = await request<RunnerJob>(config, "/v1/jobs", {
    method: "POST",
    signal,
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify({
      session_id: config.sessionId,
      project_id: config.projectId,
      project_manifest: project,
      instruction,
    }),
  });
  onProgress?.({ status: job.status === "running" ? "running" : "queued", jobId: job.id });

  let current = job;
  try {
    while (current.status === "queued" || current.status === "running") {
      await new Promise<void>((resolve, reject) => {
        const timer = globalThis.setTimeout(resolve, options.pollMs ?? 1_200);
        signal?.addEventListener("abort", () => {
          globalThis.clearTimeout(timer);
          reject(new DOMException("The hosted edit was cancelled.", "AbortError"));
        }, { once: true });
      });
      current = await request<RunnerJob>(config, `/v1/jobs/${encodeURIComponent(job.id)}`, { signal });
      if (current.status === "queued" || current.status === "running") {
        onProgress?.({ status: current.status, jobId: job.id });
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      await request<RunnerJob>(config, `/v1/jobs/${encodeURIComponent(job.id)}/cancel`, { method: "POST" }).catch(() => undefined);
    }
    throw error;
  }
  if (current.status !== "succeeded") {
    throw new HostedRunnerError(
      current.status === "cancelled" ? "The hosted edit was cancelled." : "The hosted edit failed before producing a plan.",
      current.error_code || `job_${current.status}`,
    );
  }
  onProgress?.({ status: "succeeded", jobId: job.id });
  return await request<EditPlan>(config, `/v1/jobs/${encodeURIComponent(job.id)}/edit-plan`, { signal });
}
