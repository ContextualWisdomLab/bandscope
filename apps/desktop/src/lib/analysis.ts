import {
  createAnalysisJobStatus,
  createDemoAnalysisJobRequest,
  createDemoRehearsalSong,
  isAnalysisJobStatus,
  parseAnalysisJobRequest,
  type AnalysisJobRequest,
  type AnalysisJobStatus
} from "@bandscope/shared-types";

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI_INVOKE__?: TauriInvoke;
  }
}

const browserJobStore = new Map<string, AnalysisJobStatus>();

function getInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__TAURI_INVOKE__ ?? null;
}

async function browserFallback(command: string, args?: Record<string, unknown>): Promise<unknown> {
  if (command === "start_analysis_job") {
    const request = parseAnalysisJobRequest(args?.request);
    const jobId = `browser-${request.sourceLabel.replaceAll(/\s+/g, "-").toLowerCase()}`;
    const queued = createAnalysisJobStatus({
      jobId,
      state: "queued",
      progressLabel: "Queued for analysis"
    });
    browserJobStore.set(jobId, queued);
    return queued;
  }

  if (command === "get_analysis_job_status") {
    const jobId = String(args?.jobId ?? "");
    const existing = browserJobStore.get(jobId);
    if (!existing) {
      return createAnalysisJobStatus({
        jobId,
        state: "failed",
        error: {
          code: "not_found",
          message: "Analysis job was not found."
        }
      });
    }
    const succeeded = createAnalysisJobStatus({
      jobId,
      state: "succeeded",
      progressLabel: "Analysis ready",
      requestedAt: existing.requestedAt,
      result: createDemoRehearsalSong()
    });
    browserJobStore.set(jobId, succeeded);
    return succeeded;
  }

  throw new Error(`Unknown analysis bridge command: ${command}`);
}

async function invokeAnalysis(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const invoke = getInvoke();
  if (invoke) {
    return invoke(command, args);
  }

  return browserFallback(command, args);
}

export function createDefaultAnalysisRequest(): AnalysisJobRequest {
  return createDemoAnalysisJobRequest();
}

export async function startAnalysisJob(request: AnalysisJobRequest): Promise<AnalysisJobStatus> {
  const response = await invokeAnalysis("start_analysis_job", {
    request: parseAnalysisJobRequest(request)
  });
  if (!isAnalysisJobStatus(response)) {
    throw new Error("Invalid analysis job status response");
  }
  return response;
}

export async function getAnalysisJobStatus(jobId: string): Promise<AnalysisJobStatus> {
  const response = await invokeAnalysis("get_analysis_job_status", { jobId });
  if (!isAnalysisJobStatus(response)) {
    throw new Error("Invalid analysis job status response");
  }
  return response;
}
