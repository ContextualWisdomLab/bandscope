import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./features/score/pdfjs", () => ({
  configureScorePdfWorker: vi.fn(),
  loadScorePdf: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 1, getPage: vi.fn() }),
    destroy: vi.fn(() => Promise.resolve())
  }))
}));

const mockLoadProject = vi.fn();
const mockSelectLocalAudioSource = vi.fn();
const mockStartAnalysisJob = vi.fn();

vi.mock("./lib/analysis", async (importActual) => {
  const actual = await importActual<typeof import("./lib/analysis")>();

  return {
    ...actual,
    loadProject: () => mockLoadProject(),
    selectLocalAudioSource: () => mockSelectLocalAudioSource(),
    startAnalysisJob: (request: unknown) => mockStartAnalysisJob(request)
  };
});

describe("App workspace recovery actions", () => {
  beforeEach(() => {
    mockLoadProject.mockReset();
    mockSelectLocalAudioSource.mockReset();
    mockStartAnalysisJob.mockReset();
  });

  it("focuses the existing YouTube field from the empty workspace card", () => {
    render(<App />);
    const youtubeInput = screen.getByRole("textbox", { name: /YouTube URL/i });

    fireEvent.click(screen.getByRole("button", { name: "Paste a YouTube URL" }));

    expect(document.activeElement).toBe(youtubeInput);
  });

  it("returns a failed workspace to the empty state when starting over", async () => {
    mockLoadProject.mockRejectedValueOnce(new Error("project load failed"));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("heading", { name: "Ready to Analyze" })).toBeTruthy();
  });

  it("clears a failed analysis source selection when starting over", async () => {
    mockSelectLocalAudioSource.mockResolvedValueOnce({
      ok: true,
      bootstrap: {
        projectId: "proj-recovery",
        source: {
          sourceKind: "local-audio",
          sourceMode: "reference",
          fileName: "recovery-take.wav",
          format: "wav"
        }
      }
    });
    mockStartAnalysisJob.mockResolvedValueOnce({
      jobId: "job-recovery",
      state: "failed",
      requestedAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:01.000Z",
      error: {
        code: "engine_unavailable",
        message: "Analysis failed"
      }
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Choose a local audio file" }));
    await waitFor(() => expect(screen.getByTitle("recovery-take.wav")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Analysis failed"));
    expect(screen.getByRole("heading", { name: "Analysis engine unavailable" })).toBeTruthy();
    expect(screen.getByTitle("recovery-take.wav")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByTitle("recovery-take.wav")).toBeNull();
    expect(screen.getByRole("button", { name: /start analysis/i })).toBeDisabled();
    expect(mockStartAnalysisJob).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["decode", "Couldn’t decode this audio"],
    ["separate", "Couldn’t separate this track"]
  ] as const)("names a %s-stage analysis failure before offering recovery", async (progressStage, expectedTitle) => {
    mockSelectLocalAudioSource.mockResolvedValueOnce({
      ok: true,
      bootstrap: {
        projectId: `proj-${progressStage}`,
        source: {
          sourceKind: "local-audio",
          sourceMode: "reference",
          fileName: `${progressStage}-take.wav`,
          format: "wav"
        }
      }
    });
    mockStartAnalysisJob.mockResolvedValueOnce({
      jobId: `job-${progressStage}`,
      state: "failed",
      requestedAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:01.000Z",
      progressStage,
      error: {
        code: "engine_unavailable",
        message: `Safe ${progressStage} failure detail`
      }
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Choose a local audio file" }));
    await waitFor(() => expect(screen.getByTitle(`${progressStage}-take.wav`)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => expect(screen.getByRole("heading", { name: expectedTitle })).toBeTruthy());
    expect(screen.getByRole("alert")).toHaveTextContent(`Safe ${progressStage} failure detail`);
    expect(screen.getByRole("button", { name: "Choose another file" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start over" })).toBeTruthy();
  });

  it("clears a failed workspace before accepting another local audio file", async () => {
    mockLoadProject.mockRejectedValueOnce(new Error("project load failed"));
    mockSelectLocalAudioSource.mockResolvedValueOnce({
      ok: true,
      bootstrap: {
        projectId: "proj-recovery",
        source: {
          sourceKind: "local-audio",
          sourceMode: "reference",
          fileName: "recovery-take.wav",
          format: "wav"
        }
      }
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Choose another file" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByTitle("recovery-take.wav")).toBeTruthy();
    expect(mockSelectLocalAudioSource).toHaveBeenCalledTimes(1);
  });
});
