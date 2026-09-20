import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const PROJECT_REVISION_CONFLICT = "Project changed since it was opened.";
const CONTENT_SHA256 = "a".repeat(64);
const { mockLoadProjectDocument, mockSaveProject } = vi.hoisted(() => ({
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
      jobId: "job-revision-conflict",
      state: "succeeded" as const,
      requestedAt: "2026-09-20T03:00:00Z",
      updatedAt: "2026-09-20T03:00:01Z",
      progressLabel: "Analysis ready",
      progressStage: "ready" as const,
      progressPercent: 100,
      result: createDemoRehearsalSong()
    }),
    subscribeToAnalysisJobUpdates: async () => () => undefined,
    loadProjectDocument: (...args: unknown[]) => mockLoadProjectDocument(...args),
    saveProject: (...args: unknown[]) => mockSaveProject(...args)
  };
});

function reopenedDocument() {
  return {
    song: createDemoRehearsalSong(),
    preferences: { selectedPlaybackSource: "full_mix" as const },
    sourceReference: {
      projectId: "project-500-5",
      artifactName: "source.wav",
      extension: "wav" as const,
      fileSizeBytes: 8192,
      contentSha256: CONTENT_SHA256
    }
  };
}

describe("App project revision conflict", () => {
  beforeEach(() => {
    mockLoadProjectDocument.mockReset();
    mockSaveProject.mockReset();
    mockSaveProject.mockResolvedValue(undefined);
  });

  it("keeps the accepted rehearsal visible and offers bounded recovery actions when reopen conflicts", async () => {
    mockLoadProjectDocument
      .mockResolvedValueOnce(reopenedDocument())
      .mockRejectedValueOnce(new Error(PROJECT_REVISION_CONFLICT));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() =>
      expect(screen.getAllByText("C#m7", { selector: "button" }).length).toBeGreaterThan(0)
    );

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/project changed elsewhere/i);
    expect(screen.getAllByText("C#m7", { selector: "button" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /keep current rehearsal/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /choose another project/i })).toBeTruthy();
  });

  it("keeps the last accepted song visible when a rehearsal mutation loses the revision race", async () => {
    mockSaveProject.mockRejectedValueOnce(new Error(PROJECT_REVISION_CONFLICT));
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Dbmaj7");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText("source.wav")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() =>
      expect(screen.getAllByText("C#m7", { selector: "button" }).length).toBeGreaterThan(0)
    );

    fireEvent.click(screen.getAllByText("C#m7", { selector: "button" })[0]!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/project changed elsewhere/i);
    expect(screen.getAllByText("C#m7", { selector: "button" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Dbmaj7").length).toBe(0);
    promptSpy.mockRestore();
  });
});
