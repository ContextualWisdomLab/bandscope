import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type RehearsalWorkspace,
  type SongRehearsalPack,
  type AnalysisJobRequest,
  parseRehearsalWorkspace,
  isRehearsalWorkspace,
  createDemoRehearsalSong
} from "@bandscope/shared-types";

/** Documented. */
export type WorkspaceUpdateCallback = (workspace: RehearsalWorkspace) => void;

/** Documented. */
type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI_INVOKE__?: TauriInvoke;
  }
}

/** Documented. */
function getInvoke(): TauriInvoke | null {
  if (typeof window === "undefined" || !isTauri()) {
    return null;
  }
  return window.__TAURI_INVOKE__ ?? invoke;
}

const mockWorkspace: RehearsalWorkspace = {
  id: "mock-ws",
  title: "Browser Mock Workspace",
  songs: [],
  workspaceVersion: 1
};

const mockSongsById = new Map<string, SongRehearsalPack>();

type MockListener = (event: { payload: unknown }) => void;
const mockListeners = new Set<MockListener>();

/** Documented. */
function getMockSong(jobId: string): SongRehearsalPack | undefined {
  const cachedPack = mockSongsById.get(jobId);
  if (cachedPack) {
    return cachedPack;
  }
  const pack = mockWorkspace.songs.find(song => song.id === jobId);
  if (pack) {
    mockSongsById.set(jobId, pack);
  }
  return pack;
}

/**
 * Triggers a mock workspace update to all listeners.
 */
function triggerMockUpdate() {
  const payload = structuredClone(mockWorkspace);
  mockListeners.forEach(listener => listener({ payload }));
}

/** Documented. */
async function browserFallback(command: string, args?: Record<string, unknown>): Promise<unknown> {
  if (command === "get_workspace_state") {
    return structuredClone(mockWorkspace);
  }
  
  if (command === "enqueue_song") {
    const request = args?.request as AnalysisJobRequest;
    const packId = `pack-${Date.now()}`;
    const pack: SongRehearsalPack = {
      id: packId,
      packState: "queued",
      sourceLabel: request.sourceKind === "local_audio" ? request.sourceLabel : "Demo Song",
      engineState: "queued"
    };
    mockWorkspace.songs.push(pack);
    mockSongsById.set(pack.id, pack);
    triggerMockUpdate();
    
    // Simulate processing
    setTimeout(() => {
      pack.packState = "analyzing";
      pack.engineState = "running";
      triggerMockUpdate();

      setTimeout(() => {
        // We use Object.assign to mutate the cached pack reference, avoiding an O(N) lookup.
        Object.assign(pack, {
          packState: "ready",
          engineState: "succeeded",
          song: createDemoRehearsalSong()
        });
        triggerMockUpdate();
      }, 2000);
    }, 1000);
    
    return;
  }
  
  if (command === "retry_song") {
    const jobId = args?.jobId as string;
    const pack = getMockSong(jobId);
    if (pack) {
      pack.packState = "queued";
      pack.engineState = "queued";
      
      triggerMockUpdate();
      
      // Simulate processing
      setTimeout(() => {
        pack.packState = "analyzing";
        pack.engineState = "running";
        triggerMockUpdate();
        setTimeout(() => {
          Object.assign(pack, {
            packState: "ready",
            engineState: "succeeded",
            song: createDemoRehearsalSong()
          });
          triggerMockUpdate();
        }, 2000);
      }, 1000);
    }
    return;
  }

  if (command === "cancel_song") {
    const jobId = args?.jobId as string;
    mockWorkspace.songs = mockWorkspace.songs.filter(p => p.id !== jobId);
    mockSongsById.delete(jobId);
    triggerMockUpdate();
    return;
  }

  throw new Error(`Unknown analysis bridge command: ${command}`);
}

/** Documented. */
async function invokeRunner(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const invokeCommand = getInvoke();
  if (invokeCommand) {
    return invokeCommand(command, args);
  }
  return browserFallback(command, args);
}

/** Documented. */
export async function enqueueSong(request: AnalysisJobRequest): Promise<void> {
  await invokeRunner("enqueue_song", { request });
}

/** Documented. */
export async function retrySong(jobId: string): Promise<void> {
  await invokeRunner("retry_song", { jobId });
}

/** Documented. */
export async function cancelSong(jobId: string): Promise<void> {
  await invokeRunner("cancel_song", { jobId });
}

/** Documented. */
export async function subscribeToWorkspaceUpdates(callback: WorkspaceUpdateCallback): Promise<UnlistenFn> {
  const invokeCommand = getInvoke();
  
  if (invokeCommand) {
    return listen<unknown>("workspace-updated", (event) => {
      if (isRehearsalWorkspace(event.payload)) {
        callback(parseRehearsalWorkspace(event.payload));
      } else {
        // eslint-disable-next-line no-console -- Warn about invalid payload structure
        console.warn("Received invalid workspace update from Tauri");
      }
    });
  } else {
    // Browser fallback
    /**
     * Internal listener for fallback mock updates.
     */
    const listener: MockListener = (event) => {
      if (isRehearsalWorkspace(event.payload)) {
        callback(parseRehearsalWorkspace(event.payload));
      }
    };
    mockListeners.add(listener);
    return () => {
      mockListeners.delete(listener);
    };
  }
}

/** Documented. */
export async function getWorkspaceState(): Promise<RehearsalWorkspace | null> {
  try {
    const response = await invokeRunner("get_workspace_state");
    if (!response) return null;
    return parseRehearsalWorkspace(response);
  } catch (error) {
    // eslint-disable-next-line no-console -- Error logging for workspace state fetch failure
    console.error("Failed to get workspace state:", error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}
