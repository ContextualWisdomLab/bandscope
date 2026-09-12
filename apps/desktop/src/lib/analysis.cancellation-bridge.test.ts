import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoAnalysisJobRequest } from "@bandscope/shared-types";
import {
  cancelAnalysisJob,
  getAnalysisJobStatus,
  startAnalysisJob
} from "./analysis";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: unknown;
};

const tauriWindow = window as TauriWindow;

describe("analysis cancellation bridge", () => {
  beforeEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__;
    delete tauriWindow.__TAURI_INVOKE__;
  });

  it("forwards a BandScope job id to the native cancellation command", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      jobId: "job-42",
      state: "running",
      requestedAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:01.000Z",
      progressLabel: "Running analysis",
      progressStage: "decode",
      progressPercent: 10
    });

    const status = await cancelAnalysisJob("job-42");

    expect(tauriWindow.__TAURI_INVOKE__).toHaveBeenCalledWith("cancel_analysis_job", {
      jobId: "job-42"
    });
    expect(status).toMatchObject({ jobId: "job-42", state: "running" });
  });

  it("rejects malformed native cancellation status through the shared parser boundary", async () => {
    tauriWindow.__TAURI_INVOKE__ = vi.fn().mockResolvedValue({
      jobId: "job-malformed",
      state: "cancelled",
      requestedAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:01.000Z"
    });

    await expect(cancelAnalysisJob("job-malformed")).rejects.toThrow(
      "Invalid analysis job status response"
    );
  });

  it("keeps queued browser fallback cancellation terminal instead of later succeeding", async () => {
    const queued = await startAnalysisJob(createDemoAnalysisJobRequest());

    const acknowledged = await cancelAnalysisJob(queued.jobId);
    expect(acknowledged).toMatchObject({ jobId: queued.jobId, state: "queued" });

    const cancelled = await getAnalysisJobStatus(queued.jobId);
    expect(cancelled).toMatchObject({
      jobId: queued.jobId,
      state: "failed",
      error: {
        code: "cancelled",
        message: "Analysis was cancelled."
      }
    });

    await expect(getAnalysisJobStatus(queued.jobId)).resolves.toEqual(cancelled);
  });

  it("keeps running browser fallback cancellation terminal after a progress race", async () => {
    const queued = await startAnalysisJob(createDemoAnalysisJobRequest());
    const running = await getAnalysisJobStatus(queued.jobId);
    expect(running).toMatchObject({ jobId: queued.jobId, state: "running" });

    const acknowledged = await cancelAnalysisJob(queued.jobId);
    expect(acknowledged).toEqual(running);

    const cancelled = await getAnalysisJobStatus(queued.jobId);
    expect(cancelled).toMatchObject({
      jobId: queued.jobId,
      state: "failed",
      error: {
        code: "cancelled",
        message: "Analysis was cancelled."
      }
    });

    await expect(getAnalysisJobStatus(queued.jobId)).resolves.toEqual(cancelled);
  });
});
