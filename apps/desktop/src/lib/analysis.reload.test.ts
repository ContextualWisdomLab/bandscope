import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: unknown;
};

const tauriWindow = window as TauriWindow;

const licensedDemoBootstrap = {
  projectId: "licensed-demo-project",
  sourceMode: "reference" as const,
  projectRoot: "/tmp/bandscope/projects/licensed-demo-project",
  cacheRoot: "/tmp/bandscope/cache/licensed-demo-project",
  tempRoot: "/tmp/bandscope/temp/licensed-demo-project",
  source: {
    sourcePath: "/tmp/bandscope/resources/demo/late-night-set.wav",
    fileName: "late-night-set.wav",
    extension: "wav" as const,
    fileSizeBytes: 441044
  }
};

describe("licensed demo renderer reload", () => {
  beforeEach(() => {
    vi.resetModules();
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("keeps the canonical demo title when a running job is polled after module reload", async () => {
    const engineResult = { ...createDemoRehearsalSong(), title: "Analyzed Track" };
    const nativeInvoke = vi.fn(async (command: string) => {
      if (command === "select_demo_audio_source") {
        return licensedDemoBootstrap;
      }
      if (command === "start_analysis_job" || command === "get_analysis_job_status") {
        return {
          jobId: "job-licensed-demo",
          state: "succeeded",
          requestedAt: "2026-09-02T00:00:00.000Z",
          updatedAt: "2026-09-02T00:00:01.000Z",
          result: engineResult
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    tauriWindow.__TAURI_INVOKE__ = nativeInvoke;

    const analysisBeforeReload = await import("./analysis");
    const selection = await analysisBeforeReload.selectDemoAudioSource();
    expect(selection.ok).toBe(true);
    if (!selection.ok) {
      throw new Error("licensed demo selection must succeed through the native bridge");
    }

    const startedStatus = await analysisBeforeReload.startAnalysisJob({
      sourceKind: "local_audio",
      projectId: selection.bootstrap.projectId,
      sourceLabel: selection.bootstrap.source.fileName,
      roleFocus: ["bass-guitar"]
    });
    expect(startedStatus.result?.title).toBe("Late Night Set");

    vi.resetModules();
    const analysisAfterReload = await import("./analysis");
    const polledStatus = await analysisAfterReload.getAnalysisJobStatus("job-licensed-demo");

    expect(polledStatus.result?.title).toBe("Late Night Set");
  });
});
