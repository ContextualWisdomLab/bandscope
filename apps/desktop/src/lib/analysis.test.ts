import { beforeEach, describe, expect, it, vi } from "vitest";
import { importYoutubeUrl } from "./analysis";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: unknown;
};

const tauriWindow = window as TauriWindow;

describe("analysis bridge", () => {
  beforeEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("imports a standard YouTube URL through the browser fallback when Tauri is absent", async () => {
    const selection = await importYoutubeUrl("https://www.youtube.com/watch?v=4ozX4yFUC34");

    expect(selection).toEqual({
      ok: true,
      bootstrap: {
        projectId: "browser-youtube-project",
        sourceMode: "reference",
        projectRoot: "browser://bandscope/projects/browser-youtube-project",
        cacheRoot: "browser://bandscope/cache/browser-youtube-project",
        tempRoot: "browser://bandscope/temp/browser-youtube-project",
        source: {
          sourcePath: "browser://bandscope/temp/browser-youtube-project/youtube-preview.m4a",
          fileName: "youtube-preview.m4a",
          extension: "m4a",
          fileSizeBytes: 1
        }
      }
    });
  });

  it("uses the browser fallback when Tauri internals are present but invoke is unavailable", async () => {
    tauriWindow.__TAURI_INTERNALS__ = {};

    const selection = await importYoutubeUrl("https://www.youtube.com/watch?v=4ozX4yFUC34");

    expect(selection.ok).toBe(true);
  });

  it("keeps browser fallback URL intake aligned with the native YouTube allowlist", async () => {
    const selection = await importYoutubeUrl("https://example.com/watch?v=4ozX4yFUC34");

    expect(selection).toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Only standard YouTube URLs are supported."
      }
    });
  });

  it("uses the Tauri v1 invoke shim when it is available", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      projectId: "native-youtube-project",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/native-youtube-project",
      cacheRoot: "/tmp/bandscope/cache/native-youtube-project",
      tempRoot: "/tmp/bandscope/temp/native-youtube-project",
      source: {
        sourcePath: "/tmp/bandscope/temp/native-youtube-project/youtube.wav",
        fileName: "youtube.wav",
        extension: "wav",
        fileSizeBytes: 1024
      }
    });

    const selection = await importYoutubeUrl("https://youtu.be/4ozX4yFUC34");

    expect(tauriWindow.__TAURI_INVOKE__).toHaveBeenCalledWith("import_youtube_url", {
      url: "https://youtu.be/4ozX4yFUC34"
    });
    expect(selection.ok).toBe(true);
  });

  it("ignores a non-function Tauri v1 invoke shim", async () => {
    (window as unknown as { __TAURI_INVOKE__?: unknown }).__TAURI_INVOKE__ = "not-callable";

    const selection = await importYoutubeUrl("https://youtu.be/4ozX4yFUC34");

    expect(selection.ok).toBe(true);
  });

  it("rejects unsupported YouTube URLs before crossing the Tauri bridge", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn();

    const selection = await importYoutubeUrl("http://youtube.com/watch?v=4ozX4yFUC34");

    expect(tauriWindow.__TAURI_INVOKE__).not.toHaveBeenCalled();
    expect(selection).toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Only standard YouTube URLs are supported."
      }
    });
  });

  it("rejects duplicate YouTube video identifiers before crossing the Tauri bridge", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn();

    const selection = await importYoutubeUrl("https://youtube.com/watch?v=4ozX4yFUC34&v=");

    expect(tauriWindow.__TAURI_INVOKE__).not.toHaveBeenCalled();
    expect(selection).toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Only standard YouTube URLs are supported."
      }
    });
  });

  it.each([
    "https://youtube.com/watch?v=too-short",
    "https://youtube.com/watch?v=4ozX4yFUC3!",
    "https://youtu.be/too-short",
    "https://youtu.be/4ozX4yFUC3!"
  ])("rejects malformed YouTube video identifiers before crossing the Tauri bridge", async (url) => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn();

    const selection = await importYoutubeUrl(url);

    expect(tauriWindow.__TAURI_INVOKE__).not.toHaveBeenCalled();
    expect(selection).toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Only standard YouTube URLs are supported."
      }
    });
  });
});
