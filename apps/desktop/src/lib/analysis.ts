import { invoke } from "@tauri-apps/api/core";
import {
  createAnalysisJobStatus,
  createDemoAnalysisJobRequest,
  createDemoRehearsalSong,
  isAnalysisJobStatus,
  parseAnalysisJobRequest,
  parseProjectBootstrapSummary,
  parseRehearsalSong,
  type AnalysisJobError,
  type AnalysisJobRequest,
  type AnalysisJobStatus,
  type ProjectBootstrapSummary,
  type RehearsalSong
} from "@bandscope/shared-types";

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI_INVOKE__?: TauriInvoke;
  }
}

const browserJobStore = new Map<string, AnalysisJobStatus>();
const UNSUPPORTED_LOCAL_AUDIO_MESSAGE = "Choose a WAV, MP3, FLAC, or M4A file to start analysis.";
const SAFE_LOCAL_AUDIO_MESSAGES = new Set([
  UNSUPPORTED_LOCAL_AUDIO_MESSAGE,
  "Could not read the selected audio file.",
  "Could not prepare the local project workspace.",
  "Could not prepare the local cache workspace.",
  "Could not prepare the local temp workspace."
]);

export type LocalAudioSelectionResult =
  | { ok: true; bootstrap: ProjectBootstrapSummary }
  | { ok: false; error: AnalysisJobError };

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

  if (command === "select_local_audio_source") {
    throw new Error(UNSUPPORTED_LOCAL_AUDIO_MESSAGE);
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

  if (command === "save_project") {
    return;
  }

  if (command === "load_project") {
    throw new Error("Local load not supported in browser");
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

export async function selectLocalAudioSource(): Promise<LocalAudioSelectionResult> {
  try {
    const response = await invokeAnalysis("select_local_audio_source");
    return {
      ok: true,
      bootstrap: parseProjectBootstrapSummary(response)
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message:
          error instanceof Error && SAFE_LOCAL_AUDIO_MESSAGES.has(error.message)
            ? error.message
            : UNSUPPORTED_LOCAL_AUDIO_MESSAGE
      }
    };
  }
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

export async function importYoutubeUrl(url: string): Promise<LocalAudioSelectionResult> {
  try {
    const response = await invokeAnalysis("import_youtube_url", { url });
    return {
      ok: true,
      bootstrap: parseProjectBootstrapSummary(response)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : "YouTube import failed.");
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message
      }
    };
  }
}

export async function saveProject(song: RehearsalSong): Promise<void> {
  const parsedSong = parseRehearsalSong(song);
  await invokeAnalysis("save_project", { payload: parsedSong });
}

export async function loadProject(): Promise<RehearsalSong> {
  const response = await invokeAnalysis("load_project");
  return parseRehearsalSong(response);
}
