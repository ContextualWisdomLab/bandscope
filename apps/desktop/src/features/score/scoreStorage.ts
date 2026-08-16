import { invoke } from "@tauri-apps/api/core";
import type { ScoreAttachment } from "@bandscope/shared-types";

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

type TauriBridgeWindow = Window & {
  __TAURI_INTERNALS__?: { invoke?: unknown };
  __TAURI_INVOKE__?: TauriInvoke;
};

/**
 * Attachment metadata plus the validated on-disk size reported by the
 * desktop bridge when a score PDF is copied into the project workspace.
 */
export type ScoreAttachResult = ScoreAttachment & { fileSizeBytes: number };

const BRIDGE_UNAVAILABLE_MESSAGE = "Score PDFs are only available in the desktop app.";
const INVALID_RESPONSE_MESSAGE = "Invalid score bridge response";

/**
 * Resolve the desktop invoke bridge following the same detection rules as
 * the analysis bridge: prefer Tauri v2 internals, fall back to the legacy
 * test/dev shim, and return null in plain browsers.
 */
function getInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") {
    return null;
  }

  const bridgeWindow = window as TauriBridgeWindow;
  if (bridgeWindow.__TAURI_INTERNALS__ && typeof bridgeWindow.__TAURI_INTERNALS__.invoke === "function") {
    return invoke;
  }

  if (typeof bridgeWindow.__TAURI_INVOKE__ === "function") {
    return bridgeWindow.__TAURI_INVOKE__;
  }

  return null;
}

/**
 * Invoke a score storage command on the desktop bridge, failing closed with
 * a stable error when no bridge is available (browser preview builds).
 */
async function invokeScoreCommand(command: string, args: Record<string, unknown>): Promise<unknown> {
  const invokeCommand = getInvoke();
  if (!invokeCommand) {
    throw new Error(BRIDGE_UNAVAILABLE_MESSAGE);
  }

  return invokeCommand(command, args);
}

/**
 * Open the native PDF picker and copy the validated score into the
 * app-owned project workspace. Security Notes: the file path never crosses
 * the IPC boundary from JS; the Rust command owns the dialog, validation
 * (magic bytes, size cap, no symlinks), and the copy destination.
 */
export async function attachScorePdf(projectId: string, songId: string): Promise<ScoreAttachResult> {
  const response = await invokeScoreCommand("attach_score_pdf", { projectId, songId });
  if (typeof response !== "object" || response === null) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const payload = response as Record<string, unknown>;
  const scoreId = payload.scoreId;
  const fileName = payload.fileName;
  const fileSizeBytes = payload.fileSizeBytes;
  if (
    typeof scoreId !== "string" ||
    typeof fileName !== "string" ||
    typeof fileSizeBytes !== "number" ||
    !Number.isSafeInteger(fileSizeBytes) ||
    fileSizeBytes < 0
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  return {
    id: scoreId,
    fileName,
    fileSizeBytes
  };
}

/**
 * Read the validated score PDF bytes for a previously attached score.
 * Security Notes: only allowlisted ids cross the IPC boundary; the Rust
 * command rebuilds and canonicalizes the path inside the app-owned root.
 */
export async function readScorePdf(projectId: string, scoreId: string): Promise<Uint8Array> {
  const response = await invokeScoreCommand("read_score_pdf", { projectId, scoreId });
  if (response instanceof Uint8Array) {
    return new Uint8Array(response);
  }
  if (response instanceof ArrayBuffer) {
    return new Uint8Array(response).slice();
  }
  if (Array.isArray(response)) {
    const byteCount = response.length;
    if (!Number.isSafeInteger(byteCount) || byteCount < 0) {
      throw new Error(INVALID_RESPONSE_MESSAGE);
    }
    const bytes = new Uint8Array(byteCount);
    for (let index = 0; index < byteCount; index += 1) {
      const byte = response[index];
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
        throw new Error(INVALID_RESPONSE_MESSAGE);
      }
      bytes[index] = byte;
    }
    return bytes;
  }

  throw new Error(INVALID_RESPONSE_MESSAGE);
}

/**
 * Delete the stored score PDF copy. Resolves to false when the file was
 * already gone so callers can treat removal as idempotent.
 */
export async function removeScorePdf(projectId: string, scoreId: string): Promise<boolean> {
  const response = await invokeScoreCommand("remove_score_pdf", { projectId, scoreId });
  if (typeof response !== "boolean") {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  return response;
}
