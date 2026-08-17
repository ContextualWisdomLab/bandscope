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

vi.mock("./lib/analysis", async (importActual) => {
  const actual = await importActual<typeof import("./lib/analysis")>();

  return {
    ...actual,
    loadProject: () => mockLoadProject(),
    selectLocalAudioSource: () => mockSelectLocalAudioSource()
  };
});

describe("App workspace recovery actions", () => {
  beforeEach(() => {
    mockLoadProject.mockReset();
    mockSelectLocalAudioSource.mockReset();
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
