import { beforeEach, expect, it } from "vitest";
import { createDemoAnalysisJobRequest, createDemoRehearsalSong } from "@bandscope/shared-types";

import { getAnalysisJobStatus, saveProject, startAnalysisJob } from "./analysis";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: unknown;
};

const tauriWindow = window as TauriWindow;

beforeEach(() => {
  delete tauriWindow.__TAURI_INTERNALS__;
  delete tauriWindow.__TAURI_INVOKE__;
});

it("fails closed instead of synthesizing browser-only analysis success", async () => {
  const status = await startAnalysisJob(createDemoAnalysisJobRequest());

  expect(status).toMatchObject({
    state: "failed",
    error: {
      code: "engine_unavailable",
      message: "BandScope analysis requires the Tauri runtime"
    }
  });
  expect(status.result).toBeUndefined();
});

it("does not retain a synthetic browser job after fail-closed analysis rejection", async () => {
  const status = await startAnalysisJob(createDemoAnalysisJobRequest());
  const lookup = await getAnalysisJobStatus(status.jobId);

  expect(lookup).toMatchObject({
    state: "failed",
    error: {
      code: "not_found",
      message: "Analysis job was not found."
    }
  });
  expect(lookup.result).toBeUndefined();
});

it("fails closed instead of reporting browser-only project save success", async () => {
  await expect(saveProject(createDemoRehearsalSong())).rejects.toThrow(
    "Project save requires the Tauri runtime."
  );
});
