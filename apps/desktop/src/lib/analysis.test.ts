import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoAnalysisJobRequest, createDemoRehearsalSong } from "@bandscope/shared-types";
import {
  MAX_YOUTUBE_URL_LENGTH,
  getAnalysisJobStatus,
  importYoutubeUrl,
  selectDemoAudioSource,
  startAnalysisJob
} from "./analysis";

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

  it("fails closed when the licensed demo is requested outside Tauri", async () => {
    const selection = await selectDemoAudioSource();

    expect(selection).toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "The licensed demo song could not be loaded. Use your own song to start tonight."
      }
    });
  });

  it("does not invent a browser demo bootstrap when Tauri internals lack invoke", async () => {
    tauriWindow.__TAURI_INTERNALS__ = {};

    const selection = await selectDemoAudioSource();

    expect(selection.ok).toBe(false);
    if (selection.ok) {
      throw new Error("browser demo intake must fail closed");
    }
    expect(selection.error.message).toMatch(/use your own song/i);
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

  it("rejects non-standard YouTube subdomains before crossing the Tauri bridge", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn();

    const selection = await importYoutubeUrl("https://evil.youtube.com/watch?v=4ozX4yFUC34");

    expect(tauriWindow.__TAURI_INVOKE__).not.toHaveBeenCalled();
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

  it("preserves the canonical licensed-demo title through start and polling", async () => {
    const engineResult = {
      ...createDemoRehearsalSong(),
      title: "Analyzed Track"
    };
    const nativeInvoke = vi.fn(async (command: string) => {
      if (command === "select_demo_audio_source") {
        return {
          projectId: "licensed-demo-project",
          sourceMode: "reference",
          projectRoot: "/tmp/bandscope/projects/licensed-demo-project",
          cacheRoot: "/tmp/bandscope/cache/licensed-demo-project",
          tempRoot: "/tmp/bandscope/temp/licensed-demo-project",
          source: {
            sourcePath: "/tmp/bandscope/resources/demo/late-night-set.wav",
            fileName: "late-night-set.wav",
            extension: "wav",
            fileSizeBytes: 441044
          }
        };
      }
      if (command === "start_analysis_job" || command === "get_analysis_job_status") {
        return {
          jobId: "job-licensed-demo",
          state: "succeeded",
          requestedAt: "2026-03-12T00:00:00.000Z",
          updatedAt: "2026-03-12T00:00:01.000Z",
          progressLabel: "Analysis ready for late-night-set.wav",
          progressStage: "ready",
          progressPercent: 100,
          cacheStatus: "stored",
          result: engineResult
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    tauriWindow.__TAURI_INVOKE__ = nativeInvoke;

    const selection = await selectDemoAudioSource();
    expect(selection.ok).toBe(true);
    if (!selection.ok) {
      throw new Error("licensed demo selection must succeed through the native bridge");
    }

    const status = await startAnalysisJob({
      sourceKind: "local_audio",
      projectId: selection.bootstrap.projectId,
      sourceLabel: selection.bootstrap.source.fileName,
      roleFocus: ["bass-guitar"]
    });

    expect(nativeInvoke).toHaveBeenCalledWith("start_analysis_job", {
      request: expect.objectContaining({ sourceLabel: "Late Night Set" })
    });
    expect(status.progressLabel).toBe("Analysis ready for Late Night Set");
    expect(status.result?.title).toBe("Late Night Set");

    const polledStatus = await getAnalysisJobStatus("job-licensed-demo");
    expect(polledStatus.progressLabel).toBe("Analysis ready for Late Night Set");
    expect(polledStatus.result?.title).toBe("Late Night Set");
  });

  it("normalizes legacy analysis job status responses before returning them", async () => {
    const legacyResult = createDemoRehearsalSong() as unknown as {
      sections: Array<Record<string, unknown>>;
    };
    delete legacyResult.sections[0]!.timeRange;
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      jobId: "job-legacy",
      state: "succeeded",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      result: legacyResult
    });

    const status = await getAnalysisJobStatus("job-legacy");

    expect(status.result?.sections[0]?.timeRange).toEqual({ start: 0, end: 1 });
  });

  it("fails browser analysis closed instead of synthesizing a rehearsal result", async () => {
    const status = await startAnalysisJob(createDemoAnalysisJobRequest());

    expect(status).toMatchObject({
      state: "failed",
      error: {
        code: "engine_unavailable",
        message: "Analysis engine is unavailable."
      }
    });
    expect(status.result).toBeUndefined();
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

  it("rejects oversized YouTube URLs before crossing the Tauri bridge", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn();
    const urlPrefix = "https://youtube.com/watch?v=4ozX4yFUC34&x=";
    const oversizedUrl = `${urlPrefix}${"a".repeat(MAX_YOUTUBE_URL_LENGTH - urlPrefix.length + 1)}`;

    const selection = await importYoutubeUrl(oversizedUrl);

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
