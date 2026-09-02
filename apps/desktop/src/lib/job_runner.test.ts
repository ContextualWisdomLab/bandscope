import { createDemoAnalysisJobRequest } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { enqueueSong, retrySong } from "./job_runner";

describe("legacy analysis runner browser boundary", () => {
  it("fails closed instead of synthesizing browser analysis", async () => {
    await expect(enqueueSong(createDemoAnalysisJobRequest())).rejects.toThrow(
      "Analysis engine is unavailable outside the desktop runtime."
    );
    await expect(retrySong("browser-job")).rejects.toThrow(
      "Analysis engine is unavailable outside the desktop runtime."
    );
  });
});
