import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type RehearsalWorkspace,
  type AnalysisJobRequest,
  parseRehearsalWorkspace,
  isRehearsalWorkspace
} from "@bandscope/shared-types";

/** Receives validated rehearsal-workspace updates from the native bridge. */
export type WorkspaceUpdateCallback = (rehearsalWorkspace: RehearsalWorkspace) => void;

/** Invokes one typed Tauri command with its bridge-owned argument envelope. */
type TauriInvoke = (
  bridgeCommand: string,
  commandArguments?: Record<string, unknown>
) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI_INVOKE__?: TauriInvoke;
  }
}

/** Returns the native Tauri invoke boundary when desktop runtime authority is available. */
function getTauriInvoke(): TauriInvoke | null {
  if (typeof window === "undefined" || !isTauri()) {
    return null;
  }
  return window.__TAURI_INVOKE__ ?? invoke;
}

const browserFallbackWorkspace: RehearsalWorkspace = {
  id: "mock-ws",
  title: "Browser Mock Workspace",
  songs: [],
  workspaceVersion: 1
};

type BrowserWorkspaceListener = (workspaceEvent: { payload: unknown }) => void;
const browserWorkspaceListeners = new Set<BrowserWorkspaceListener>();

/** Broadcasts the read-only browser fallback workspace to local listeners. */
function triggerBrowserWorkspaceUpdate(): void {
  const workspacePayload = structuredClone(browserFallbackWorkspace);
  browserWorkspaceListeners.forEach((workspaceListener) =>
    workspaceListener({ payload: workspacePayload })
  );
}

/**
 * Serves only the read-only browser workspace boundary.
 *
 * Analysis mutations fail closed so browser-only code can never manufacture a
 * successful rehearsal result that could be mistaken for native analysis.
 */
async function browserFallback(
  bridgeCommand: string,
  _commandArguments?: Record<string, unknown>
): Promise<unknown> {
  if (bridgeCommand === "get_workspace_state") {
    return structuredClone(browserFallbackWorkspace);
  }

  if (
    bridgeCommand === "enqueue_song" ||
    bridgeCommand === "retry_song" ||
    bridgeCommand === "cancel_song"
  ) {
    throw new Error("Analysis engine is unavailable outside the desktop runtime.");
  }

  throw new Error(`Unknown analysis bridge command: ${bridgeCommand}`);
}

/** Routes a bridge command to native Tauri or the fail-closed browser boundary. */
async function invokeRunner(
  bridgeCommand: string,
  commandArguments?: Record<string, unknown>
): Promise<unknown> {
  const tauriInvoke = getTauriInvoke();
  if (tauriInvoke) {
    return tauriInvoke(bridgeCommand, commandArguments);
  }
  return browserFallback(bridgeCommand, commandArguments);
}

/** Enqueues one analysis request through the native desktop bridge. */
export async function enqueueSong(analysisRequest: AnalysisJobRequest): Promise<void> {
  await invokeRunner("enqueue_song", { request: analysisRequest });
}

/** Retries one existing analysis job through the native desktop bridge. */
export async function retrySong(analysisJobId: string): Promise<void> {
  await invokeRunner("retry_song", { jobId: analysisJobId });
}

/** Cancels one existing analysis job through the native desktop bridge. */
export async function cancelSong(analysisJobId: string): Promise<void> {
  await invokeRunner("cancel_song", { jobId: analysisJobId });
}

/** Subscribes to validated workspace updates from native Tauri or the browser placeholder. */
export async function subscribeToWorkspaceUpdates(
  workspaceCallback: WorkspaceUpdateCallback
): Promise<UnlistenFn> {
  const tauriInvoke = getTauriInvoke();

  if (tauriInvoke) {
    return listen<unknown>("workspace-updated", (workspaceEvent) => {
      if (isRehearsalWorkspace(workspaceEvent.payload)) {
        workspaceCallback(parseRehearsalWorkspace(workspaceEvent.payload));
      } else {
        // eslint-disable-next-line no-console -- Warn about invalid payload structure
        console.warn("Received invalid workspace update from Tauri");
      }
    });
  }

  const workspaceListener: BrowserWorkspaceListener = (workspaceEvent) => {
    if (isRehearsalWorkspace(workspaceEvent.payload)) {
      workspaceCallback(parseRehearsalWorkspace(workspaceEvent.payload));
    }
  };
  browserWorkspaceListeners.add(workspaceListener);
  triggerBrowserWorkspaceUpdate();
  return () => {
    browserWorkspaceListeners.delete(workspaceListener);
  };
}

/** Reads the current rehearsal workspace without surfacing bridge exceptions to the UI. */
export async function getWorkspaceState(): Promise<RehearsalWorkspace | null> {
  try {
    const workspaceResponse = await invokeRunner("get_workspace_state");
    if (!workspaceResponse) return null;
    return parseRehearsalWorkspace(workspaceResponse);
  } catch (workspaceError) {
    // eslint-disable-next-line no-console -- Error logging for workspace state fetch failure
    console.error(
      "Failed to get workspace state:",
      workspaceError instanceof Error ? workspaceError.message : "Unknown error"
    );
    return null;
  }
}
