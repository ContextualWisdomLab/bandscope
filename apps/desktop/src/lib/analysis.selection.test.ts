import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectLocalAudioSource } from "./analysis";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: unknown;
};

const tauriWindow = window as TauriWindow;

/**
 * Security Notes:
 * - Untrusted input: native picker rejection text, including path- and secret-shaped diagnostics.
 * - Trust boundary: Tauri `select_local_audio_source` → this bridge → buyer-visible copy.
 * - Safe failure: cancellation is silent; unknown native text is replaced with supported-format guidance.
 * - Privacy: absolute paths and secret-shaped messages must not cross into LocalAudioSelectionResult.error.
 */
describe("selectLocalAudioSource cancellation and redaction", () => {
  beforeEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("treats a native User cancelled Error as a silent cancellation", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockRejectedValue(new Error("User cancelled"));

    await expect(selectLocalAudioSource()).resolves.toEqual({ ok: false, cancelled: true });
  });

  it("treats a native User cancelled string as a silent cancellation", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockRejectedValue("User cancelled");

    await expect(selectLocalAudioSource()).resolves.toEqual({ ok: false, cancelled: true });
  });

  it("preserves allowlisted file-read failure copy", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockRejectedValue(new Error("Could not read the selected audio file."));

    await expect(selectLocalAudioSource()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Could not read the selected audio file."
      }
    });
  });

  it("redacts path-shaped native diagnostics before they become buyer copy", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockRejectedValue(
      new Error("open failed: /Users/test/Music/secret-token.wav")
    );

    await expect(selectLocalAudioSource()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Choose a WAV, MP3, FLAC, or M4A file to start analysis."
      }
    });
  });

  it("redacts a non-Error native rejection that is not cancellation", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockRejectedValue("open failed: /Users/test/Music/secret-token.wav");

    await expect(selectLocalAudioSource()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Choose a WAV, MP3, FLAC, or M4A file to start analysis."
      }
    });
  });
});
