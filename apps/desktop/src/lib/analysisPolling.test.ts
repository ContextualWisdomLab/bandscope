import { describe, expect, it } from "vitest";
import { createAnalysisJobStatus, createDemoRehearsalSong } from "@bandscope/shared-types";
import * as polling from "./analysisPolling";

describe("retry only the current in-flight analysis job", () => {
  it("preserves absent status", () => {
    expect(polling).toHaveProperty("retryAnalysisJobStatus", expect.any(Function));
    expect(polling.retryAnalysisJobStatus(null, "job-A")).toBeNull();
  });

  it.each(["queued", "running"] as const)("preserves another job's %s status by reference", (state) => {
    const status = createAnalysisJobStatus({ jobId: "job-B", state });
    expect(polling.retryAnalysisJobStatus(status, "job-A")).toBe(status);
  });

  it("preserves a completed result by reference", () => {
    const status = createAnalysisJobStatus({ jobId: "job-A", state: "succeeded", result: createDemoRehearsalSong() });
    expect(polling.retryAnalysisJobStatus(status, "job-A")).toBe(status);
  });

  it("preserves a failed job and its error by reference", () => {
    const status = createAnalysisJobStatus({ jobId: "job-A", state: "failed", error: { code: "engine_unavailable", message: "Analysis unavailable." } });
    expect(polling.retryAnalysisJobStatus(status, "job-A")).toBe(status);
  });

  it.each(["queued", "running"] as const)("copies the same job's %s status without changing input", (state) => {
    const status = createAnalysisJobStatus({ jobId: "job-A", state });
    const snapshot = structuredClone(status);
    Object.freeze(status);
    const retried = polling.retryAnalysisJobStatus(status, "job-A");
    expect(retried).not.toBe(status);
    expect(retried).toEqual(status);
    expect(status).toEqual(snapshot);
  });
});
