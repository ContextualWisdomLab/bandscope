import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type RehearsalWorkspace,
  type AnalysisJobRequest,
  parseRehearsalWorkspace,
  isRehearsalWorkspace,
} from "@bandscope/shared-types";

/** Receives validated workspace updates emitted by the native analysis runtime. */
export type WorkspaceUpdateCallback = (workspace: RehearsalWorkspace) => void;

/** Narrow Tauri invocation boundary used by the desktop runtime. */
type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI_INVOKE__?: TauriInvoke;
  }
}

/** Return the native Tauri invocation function when the desktop runtime is present. */
function getInvoke(): TauriInvoke | null {
  if (typeof window === "undefined" || !isTauri()) {
    return null;
  }
  return window.__TAURI_INVOKE__ ?? invoke;
}

/** Execute a native analysis command or reject the unsupported browser-only surface. */
async function invokeRunner(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const invokeCommand = getInvoke();
  if (!invokeCommand) {
    throw new Error("BandScope analysis requires the Tauri runtime");
  }
  return invokeCommand(command, args);
}

/** Queue one analysis job in the native BandScope runtime. */
export async function enqueueSong(request: AnalysisJobRequest): Promise<void> {
  await invokeRunner("enqueue_song", { request });
}

/** Retry one existing native analysis job. */
export async function retrySong(jobId: string): Promise<void> {
  await invokeRunner("retry_song", { jobId });
}

/** Cancel one existing native analysis job. */
export async function cancelSong(jobId: string): Promise<void> {
  await invokeRunner("cancel_song", { jobId });
}

/** Subscribe to validated native workspace events without fabricating browser state. */
export async function subscribeToWorkspaceUpdates(callback: WorkspaceUpdateCallback): Promise<UnlistenFn> {
  const invokeCommand = getInvoke();

  if (!invokeCommand) {
    return () => undefined;
  }

  return listen<unknown>("workspace-updated", (event) => {
    if (isRehearsalWorkspace(event.payload)) {
      callback(parseRehearsalWorkspace(event.payload));
    } else {
      // eslint-disable-next-line no-console -- Warn about invalid payload structure
      console.warn("Received invalid workspace update from Tauri");
    }
  });
}

/** Return native workspace state, or null when the desktop runtime is unavailable. */
export async function getWorkspaceState(): Promise<RehearsalWorkspace | null> {
  if (!getInvoke()) {
    return null;
  }
  try {
    const response = await invokeRunner("get_workspace_state");
    if (!response) return null;
    return parseRehearsalWorkspace(response);
  } catch {
    // eslint-disable-next-line no-console -- Stable diagnostics exclude native error payloads.
    console.error("Failed to get workspace state.");
    return null;
  }
}
