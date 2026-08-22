import { beforeEach, describe, expect, it, vi } from "vitest";

import { selectLocalAudioSource } from "./analysis";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const tauriWindow = window as TauriWindow;

describe("local audio selection boundary", () => {
  beforeEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("preserves native picker cancellation as a silent-capable signal", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockRejectedValue(new Error("User cancelled"));

    await expect(selectLocalAudioSource()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "User cancelled"
      }
    });
  });

  it("does not expose arbitrary native picker errors to the buyer", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi
      .fn()
      .mockRejectedValue(new Error("/Users/customer/Music/private.wav token=secret-value"));

    await expect(selectLocalAudioSource()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Choose a WAV, MP3, FLAC, or M4A file to start analysis."
      }
    });
  });
});
