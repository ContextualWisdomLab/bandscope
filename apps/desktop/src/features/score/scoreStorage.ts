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

/** Path-free content identity for one currently published score object. */
export type ScorePdfReceipt = { scoreId: string; contentSha256: string };

const BRIDGE_UNAVAILABLE_MESSAGE = "Score PDFs are only available in the desktop app.";
const INVALID_RESPONSE_MESSAGE = "Invalid score bridge response";
const SHA256_HEX = /^[0-9a-f]{64}$/;

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
  if (
    typeof response !== "object" ||
    response === null ||
    typeof (response as Record<string, unknown>).scoreId !== "string" ||
    typeof (response as Record<string, unknown>).fileName !== "string" ||
    typeof (response as Record<string, unknown>).fileSizeBytes !== "number"
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
  if (Array.isArray(response) && response.every((byte) => typeof byte === "number")) {
    return Uint8Array.from(response as number[]);
  }

  throw new Error(INVALID_RESPONSE_MESSAGE);
}

/**
 * Snapshot path-free object identity before a buyer-facing detach changes
 * durable project metadata. A missing object is represented as `null`; malformed
 * bridge payloads fail closed instead of becoming deletion authority.
 */
export async function getScorePdfReceipt(
  projectId: string,
  scoreId: string
): Promise<ScorePdfReceipt | null> {
  const response = await invokeScoreCommand("get_score_pdf_receipt", { projectId, scoreId });
  if (response === null) {
    return null;
  }
  if (
    typeof response !== "object" ||
    typeof (response as Record<string, unknown>).scoreId !== "string" ||
    typeof (response as Record<string, unknown>).contentSha256 !== "string"
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const payload = response as ScorePdfReceipt;
  if (payload.scoreId !== scoreId || !SHA256_HEX.test(payload.contentSha256)) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }
  return payload;
}

/**
 * Delete a stored score only if the current object still matches the receipt
 * captured before durable metadata detachment. A false result is a safe
 * non-removal for an absent or changed object; callers must not fall back to
 * id-only deletion.
 */
export async function removeScorePdfIfReceiptMatches(
  projectId: string,
  receipt: ScorePdfReceipt
): Promise<boolean> {
  if (!receipt.scoreId || !SHA256_HEX.test(receipt.contentSha256)) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }
  const response = await invokeScoreCommand("remove_score_pdf_if_receipt_matches", {
    projectId,
    scoreId: receipt.scoreId,
    contentSha256: receipt.contentSha256
  });
  if (typeof response !== "boolean") {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  return response;
}
