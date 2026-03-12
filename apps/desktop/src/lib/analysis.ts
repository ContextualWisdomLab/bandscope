import { invoke } from "@tauri-apps/api/core";
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

  return window.__TAURI_INVOKE__ ?? invoke;
}

function browserJobId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function browserFallback(command: string, args?: Record<string, unknown>): Promise<unknown> {
  if (command === "start_analysis_job") {
    parseAnalysisJobRequest(args?.request);
    const jobId = browserJobId("browser-job");
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
  const invokeCommand = getInvoke();
  if (invokeCommand) {
    return invokeCommand(command, args);
  }

  return browserFallback(command, args);
}

export function createDefaultAnalysisRequest(): AnalysisJobRequest {
  return createDemoAnalysisJobRequest();
}

export async function startAnalysisJob(request: AnalysisJobRequest): Promise<AnalysisJobStatus> {
  let parsedRequest: AnalysisJobRequest;
  try {
    parsedRequest = parseAnalysisJobRequest(request);
  } catch (error) {
    return createAnalysisJobStatus({
      jobId: browserJobId("invalid-job"),
      state: "failed",
      error: {
        code: "invalid_request",
        message: error instanceof Error ? error.message : "Invalid analysis job request."
      }
    });
  }

  const response = await invokeAnalysis("start_analysis_job", {
    request: parsedRequest
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
