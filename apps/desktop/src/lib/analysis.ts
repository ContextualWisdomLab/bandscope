import { invoke } from "@tauri-apps/api/core";
import {
  createAnalysisJobStatus,
  createDemoAnalysisJobRequest,
  createProjectBootstrapSummary,
  parseAnalysisJobStatus,
  parseAnalysisJobRequest,
  parseProjectBootstrapSummary,
  parseRehearsalSong,
  type AnalysisJobError,
  type AnalysisJobRequest,
  type AnalysisJobStatus,
  type ProjectBootstrapSummary,
  type RehearsalSong
} from "@bandscope/shared-types";
import { listen } from "@tauri-apps/api/event";

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: unknown;
    };
    __TAURI_INVOKE__?: TauriInvoke;
  }
}

const UNSUPPORTED_LOCAL_AUDIO_MESSAGE = "Choose a WAV, MP3, FLAC, or M4A file to start analysis.";
const SAFE_LOCAL_AUDIO_MESSAGES = new Set([
  UNSUPPORTED_LOCAL_AUDIO_MESSAGE,
  "Could not read the selected audio file.",
  "Could not prepare the local project workspace.",
  "Could not prepare the local cache workspace.",
  "Could not prepare the local temp workspace."
]);
const BROWSER_ANALYSIS_UNAVAILABLE_MESSAGE = "BandScope analysis requires the Tauri runtime";
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_YOUTUBE_URL_LENGTH = 2000;

export { MAX_YOUTUBE_URL_LENGTH };

/** Documented. */
export type LocalAudioSelectionResult =
  | { ok: true; bootstrap: ProjectBootstrapSummary }
  | { ok: false; error: AnalysisJobError };

/** Documented. */
function getInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") {
    return null;
  }

  // Detect Tauri v2 only when its invoke bridge is actually available.
  const tauriInternals = window.__TAURI_INTERNALS__;
  if (tauriInternals && typeof tauriInternals.invoke === "function") {
    return invoke;
  }

  // Detect the legacy test/dev shim.
  if (typeof window.__TAURI_INVOKE__ === "function") {
    return window.__TAURI_INVOKE__;
  }

  return null;
}

/** Documented. */
export function isSupportedYoutubeUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== "string") {
    return false;
  }
  if (rawUrl.length > MAX_YOUTUBE_URL_LENGTH) {
    return false;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsedUrl.protocol !== "https:") {
    return false;
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (host === "youtu.be") {
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    return pathSegments.length === 1 && YOUTUBE_VIDEO_ID_PATTERN.test(pathSegments[0]!);
  }

  if (host === "youtube.com" || host === "www.youtube.com") {
    const videoIds = parsedUrl.searchParams.getAll("v");
    return parsedUrl.pathname === "/watch" && videoIds.length === 1 && YOUTUBE_VIDEO_ID_PATTERN.test(videoIds[0]!);
  }

  return false;
}

/** Documented. */
function browserJobId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Handle browser-preview commands without fabricating analysis success.
 *
 * Source-selection preview behavior stays explicit for existing UI development,
 * but analysis execution itself fails closed because only the Tauri runtime owns
 * the production Python subprocess and validated job lifecycle.
 */
async function browserFallback(command: string, args?: Record<string, unknown>): Promise<unknown> {
  if (command === "start_analysis_job") {
    parseAnalysisJobRequest(args?.request);
    return createAnalysisJobStatus({
      jobId: browserJobId("browser-unavailable-job"),
      state: "failed",
      error: {
        code: "engine_unavailable",
        message: BROWSER_ANALYSIS_UNAVAILABLE_MESSAGE
      }
    });
  }

  if (command === "select_local_audio_source") {
    throw new Error(UNSUPPORTED_LOCAL_AUDIO_MESSAGE);
  }

  if (command === "get_analysis_job_status") {
    return createAnalysisJobStatus({
      jobId: String(args?.jobId ?? ""),
      state: "failed",
      error: {
        code: "not_found",
        message: "Analysis job was not found."
      }
    });
  }

  if (command === "save_project") {
    throw new Error("Project save requires the Tauri runtime.");
  }

  if (command === "import_youtube_url") {
    if (!isSupportedYoutubeUrl(args?.url)) {
      throw new Error("Only standard YouTube URLs are supported.");
    }

    const projectId = "browser-youtube-project";
    return createProjectBootstrapSummary({
      projectId,
      projectRoot: `browser://bandscope/projects/${projectId}`,
      cacheRoot: `browser://bandscope/cache/${projectId}`,
      tempRoot: `browser://bandscope/temp/${projectId}`,
      source: {
        sourcePath: `browser://bandscope/temp/${projectId}/youtube-preview.m4a`,
        fileName: "youtube-preview.m4a",
        extension: "m4a",
        fileSizeBytes: 1
      }
    });
  }

  if (command === "load_project") {
    throw new Error("Local load not supported in browser");
  }

  throw new Error(`Unknown analysis bridge command: ${command}`);
}

/** Documented. */
async function invokeAnalysis(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const invokeCommand = getInvoke();
  if (invokeCommand) {
    return invokeCommand(command, args);
  }

  return browserFallback(command, args);
}

/** Documented. */
export function createDefaultAnalysisRequest(): AnalysisJobRequest {
  return createDemoAnalysisJobRequest();
}

/** Documented. */
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

/** Documented. */
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
  try {
    return parseAnalysisJobStatus(response);
  } catch {
    throw new Error("Invalid analysis job status response");
  }
}

/** Documented. */
export async function getAnalysisJobStatus(jobId: string): Promise<AnalysisJobStatus> {
  const response = await invokeAnalysis("get_analysis_job_status", { jobId });
  try {
    return parseAnalysisJobStatus(response);
  } catch {
    throw new Error("Invalid analysis job status response");
  }
}

/** Documented. */
export async function subscribeToAnalysisJobUpdates(
  jobId: string,
  onUpdate: (status: AnalysisJobStatus) => void
): Promise<() => void> {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const tauriInternals = window.__TAURI_INTERNALS__;
  if (!tauriInternals || typeof tauriInternals.invoke !== "function") {
    return () => undefined;
  }

  try {
    const unlisten = await listen<unknown>("analysis-job-updated", (event) => {
      try {
        const status = parseAnalysisJobStatus(event.payload);
        if (status.jobId === jobId) {
          onUpdate(status);
        }
      } catch {
        // Ignore malformed status payloads and keep polling fallback active.
      }
    });
    return () => {
      void unlisten();
    };
  } catch {
    return () => undefined;
  }
}

/** Documented. */
export async function importYoutubeUrl(url: string): Promise<LocalAudioSelectionResult> {
  if (!isSupportedYoutubeUrl(url)) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: "Only standard YouTube URLs are supported."
      }
    };
  }

  try {
    const response = await invokeAnalysis("import_youtube_url", { url });
    return {
      ok: true,
      bootstrap: parseProjectBootstrapSummary(response)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : (typeof error === "string" ? error : "YouTube import failed.");
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message
      }
    };
  }
}

/** Documented. */
export async function saveProject(song: RehearsalSong): Promise<void> {
  const parsedSong = parseRehearsalSong(song);
  await invokeAnalysis("save_project", { payload: parsedSong });
}

/** Documented. */
export async function loadProject(): Promise<RehearsalSong> {
  const response = await invokeAnalysis("load_project");
  return parseRehearsalSong(response);
}
