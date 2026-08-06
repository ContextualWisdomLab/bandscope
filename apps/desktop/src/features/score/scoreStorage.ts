import { invoke } from "@tauri-apps/api/core";

const BRIDGE_UNAVAILABLE_MESSAGE = "Score PDFs are only available in the desktop app.";
const INVALID_RESPONSE_MESSAGE = "Invalid score bridge response";

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: TauriInvoke;
};

function getInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tauriWindow = window as TauriWindow;
  if (typeof tauriWindow.__TAURI_INVOKE__ === "function") {
    return tauriWindow.__TAURI_INVOKE__;
  }
  if (tauriWindow.__TAURI_INTERNALS__) {
    return invoke;
  }
  return null;
}

async function invokeScoreCommand(
  command: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const invokeCommand = getInvoke();
  if (!invokeCommand) {
    throw new Error(BRIDGE_UNAVAILABLE_MESSAGE);
  }
  return invokeCommand(command, args);
}

function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function requireValidIdentifier(value: string, fieldName: string): void {
  if (!isValidIdentifier(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }
}

/**
 * Attach one PDF score to a song through the desktop bridge.
 *
 * Security Notes: project and song identifiers are validated before crossing
 * the IPC boundary, and the Rust command owns path canonicalization, MIME
 * validation, copying, and storage quotas.
 */
export async function attachScorePdf(
  projectId: string,
  songId: string
): Promise<{ id: string; fileName: string; fileSizeBytes: number } | null> {
  requireValidIdentifier(projectId, "project identifier");
  requireValidIdentifier(songId, "song identifier");

  const response = await invokeScoreCommand("attach_score_pdf", { projectId, songId });
  if (response === null) {
    return null;
  }
  if (
    typeof response !== "object" ||
    response === null ||
    Array.isArray(response) ||
    !("scoreId" in response) ||
    !("fileName" in response) ||
    !("fileSizeBytes" in response) ||
    typeof response.scoreId !== "string" ||
    typeof response.fileName !== "string" ||
    typeof response.fileSizeBytes !== "number"
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const payload = response as { scoreId: string; fileName: string; fileSizeBytes: number };
  return {
    id: payload.scoreId,
    fileName: payload.fileName,
    fileSizeBytes: payload.fileSizeBytes
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
    return response;
  }
  if (response instanceof ArrayBuffer) {
    return new Uint8Array(response);
  }
  if (Array.isArray(response)) {
    for (let index = 0; index < response.length; index += 1) {
      const byte = response[index];
      if (
        typeof byte !== "number" ||
        !Number.isInteger(byte) ||
        byte < 0 ||
        byte > 255
      ) {
        throw new Error(INVALID_RESPONSE_MESSAGE);
      }
    }
    return Uint8Array.from(response as number[]);
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