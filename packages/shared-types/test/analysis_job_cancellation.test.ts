import { isAnalysisJobStatus, parseAnalysisJobStatus } from "../src/index";

describe("analysis cancellation contract", () => {
  it("accepts the native cancelled error code as a terminal failed status", () => {
    const cancelledStatus = {
      jobId: "job-42",
      state: "failed",
      requestedAt: "2026-09-07T07:00:00Z",
      updatedAt: "2026-09-07T07:00:01Z",
      progressLabel: "Analysis cancelled",
      error: {
        code: "cancelled",
        message: "Analysis was cancelled."
      }
    };

    expect(isAnalysisJobStatus(cancelledStatus)).toBe(true);
    expect(parseAnalysisJobStatus(cancelledStatus).error?.code).toBe("cancelled");
  });
});
