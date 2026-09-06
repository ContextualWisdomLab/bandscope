import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { vi, describe, it, expect } from "vitest";
import { App } from "./App";

const { mockSaveProject } = vi.hoisted(() => ({
  mockSaveProject: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("./features/score/pdfjs", () => ({
  configureScorePdfWorker: vi.fn(),
  loadScorePdf: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 1, getPage: vi.fn() }),
    destroy: vi.fn(() => Promise.resolve())
  }))
}));

vi.mock("./lib/analysis", async (importActual) => {
  const actual = await importActual<typeof import("./lib/analysis")>();
  return {
    ...actual,
    createDefaultAnalysisRequest: () => ({
      sourceKind: "demo",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar"]
    }),
    selectLocalAudioSource: async () => ({
      ok: true as const,
      bootstrap: {
        projectId: "project-400-4",
        sourceMode: "reference" as const,
        projectRoot: "/tmp/bandscope/projects/project-400-4",
        cacheRoot: "/tmp/bandscope/cache/project-400-4",
        tempRoot: "/tmp/bandscope/temp/project-400-4",
        source: {
          sourcePath: "/tmp/bandscope/projects/project-400-4/source.wav",
          fileName: "source.wav",
          extension: "wav",
          fileSizeBytes: 4096
        }
      }
    }),
    startAnalysisJob: async () => ({
      jobId: "job-local-save",
      state: "succeeded" as const,
      requestedAt: "2026-09-06T08:00:00Z",
      updatedAt: "2026-09-06T08:00:01Z",
      progressLabel: "Analysis ready",
      progressStage: "ready" as const,
      progressPercent: 100,
      result: createDemoRehearsalSong()
    }),
    subscribeToAnalysisJobUpdates: async () => () => undefined,
    saveProject: (...args: unknown[]) => mockSaveProject(...args)
  };
});

describe("App local-audio save authority", () => {
  it("saves the analyzed local project with its exact native project id", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText("source.wav")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /save project/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(mockSaveProject).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.any(String) }),
        "full_mix",
        "project-400-4"
      );
    });
  });
});
