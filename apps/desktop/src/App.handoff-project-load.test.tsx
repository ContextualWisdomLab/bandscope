import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RehearsalSong } from "@bandscope/shared-types";
import { App } from "./App";
import { loadProject, readFileForTestOnly } from "./lib/analysis";

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: () => <div>Score view</div>
}));

vi.mock("./features/workspace/Workspace", () => ({
  Workspace: () => <div>Workspace result</div>
}));

vi.mock("./lib/analysis", () => ({
  MAX_YOUTUBE_URL_LENGTH: 2048,
  createDefaultAnalysisRequest: vi.fn(() => ({
    sourceKind: "demo",
    sourceLabel: "Late Night Set",
    roleFocus: ["keys-right"]
  })),
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  isSupportedYoutubeUrl: vi.fn(() => true),
  loadProject: vi.fn(),
  readFileForTestOnly: vi.fn(),
  saveProject: vi.fn(),
  selectLocalAudioSource: vi.fn(),
  startAnalysisJob: vi.fn(),
  subscribeToAnalysisJobUpdates: vi.fn(async () => () => undefined)
}));

vi.mock("./lib/handoff", async (importActual) => {
  const actual = await importActual<typeof import("./lib/handoff")>();
  return {
    ...actual,
    readMetadataHandoffFile: vi.fn()
  };
});

const mockedLoadProject = vi.mocked(loadProject);

function loadedSong(): RehearsalSong {
  return {
    id: "loaded-song",
    title: "Loaded song",
    sections: [],
    exportSummary: {
      format: "cue-sheet",
      headline: "Loaded rehearsal project",
      focusSections: []
    }
  } as RehearsalSong;
}

describe("App project-load source exclusion", () => {
  beforeEach(() => {
    mockedLoadProject.mockReset();
    vi.mocked(readFileForTestOnly).mockReset();
  });

  it("locks source and handoff controls until project loading settles", async () => {
    let resolveProject: ((song: RehearsalSong) => void) | null = null;
    mockedLoadProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProject = resolve;
        })
    );
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    expect(screen.getByRole("button", { name: /open project/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /choose local audio/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /import handoff/i })).toBeDisabled();
    expect(screen.getByLabelText(/youtube url/i)).toBeDisabled();

    resolveProject?.(loadedSong());
    await screen.findByText("Workspace result");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open project/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /choose local audio/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /import handoff/i })).not.toBeDisabled();
      expect(screen.getByLabelText(/youtube url/i)).not.toBeDisabled();
    });
  });
});
