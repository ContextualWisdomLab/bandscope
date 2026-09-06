import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const { mockLoadProject, mockLoadProjectDocument, mockSaveProject } = vi.hoisted(() => ({
  mockLoadProject: vi.fn(),
  mockLoadProjectDocument: vi.fn(),
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
    loadProject: (...args: unknown[]) => mockLoadProject(...args),
    loadProjectDocument: (...args: unknown[]) => mockLoadProjectDocument(...args),
    saveProject: (...args: unknown[]) => mockSaveProject(...args)
  };
});

describe("App local-audio save authority", () => {
  beforeEach(() => {
    mockLoadProject.mockReset();
    mockLoadProjectDocument.mockReset();
    mockSaveProject.mockClear();
  });

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

  it("preserves reopened source identity and playback-source intent on resave", async () => {
    const song = createDemoRehearsalSong();
    const projectDocument = {
      song,
      preferences: { selectedPlaybackSource: "vocals" as const },
      sourceReference: {
        projectId: "project-500-5",
        artifactName: "source.wav",
        extension: "wav" as const,
        fileSizeBytes: 8192,
        contentSha256: "a".repeat(64)
      }
    };
    mockLoadProject.mockResolvedValueOnce(song);
    mockLoadProjectDocument.mockResolvedValueOnce(projectDocument);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /save project/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(mockSaveProject).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.any(String) }),
        "vocals",
        "project-500-5"
      );
    });
  });
});