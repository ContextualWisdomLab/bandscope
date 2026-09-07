import { beforeEach, expect, it, vi } from "vitest";

import { importYoutubeUrl } from "./analysis";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: unknown;
};

const tauriWindow = window as TauriWindow;

beforeEach(() => {
  delete tauriWindow.__TAURI_INTERNALS__;
  delete tauriWindow.__TAURI_INVOKE__;
});

it("does not expose dependency-controlled YouTube import errors to the UI", async () => {
  tauriWindow.__TAURI_INVOKE__ = vi
    .fn()
    .mockRejectedValue(
      new Error(
        "yt-dlp failed for https://youtube.com/watch?v=4ozX4yFUC34 at C:\\Users\\Alice\\Videos token=super-secret"
      )
    );

  const selection = await importYoutubeUrl("https://youtube.com/watch?v=4ozX4yFUC34");

  expect(selection).toEqual({
    ok: false,
    error: {
      code: "invalid_request",
      message: "YouTube import failed. Try again or choose a local audio file."
    }
  });
  expect(JSON.stringify(selection)).not.toContain("Alice");
  expect(JSON.stringify(selection)).not.toContain("super-secret");
  expect(JSON.stringify(selection)).not.toContain("4ozX4yFUC34");
});
