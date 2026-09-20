import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { loadProjectDocument } from "./lib/analysis";

vi.mock("./lib/analysis", () => ({
  createDefaultAnalysisRequest: () => ({
    sourceKind: "demo",
    sourceLabel: "Project identity regression",
    roleFocus: []
  }),
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  isSupportedYoutubeUrl: vi.fn(() => true),
  loadProjectDocument: vi.fn(),
  MAX_YOUTUBE_URL_LENGTH: 2000,
  saveProject: vi.fn(),
  subscribeToAnalysisJobUpdates: vi.fn(async () => () => undefined),
  selectLocalAudioSource: vi.fn(async () => ({
    ok: false,
    error: { code: "invalid_request", message: "No local source selected." }
  })),
  startAnalysisJob: vi.fn()
}));

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: ({ projectId }: { projectId: string | null }) => (
    <div data-testid="score-project-id">{projectId ?? "missing-project-id"}</div>
  )
}));

vi.mock("./features/workspace/Workspace", () => ({
  Workspace: () => <div data-testid="workspace">workspace</div>
}));

const mockLoadProjectDocument = vi.mocked(loadProjectDocument);

describe("App score project identity", () => {
  beforeEach(() => {
    mockLoadProjectDocument.mockReset();
  });

  it("passes the reopened app-owned publication project id to ScoreView", async () => {
    mockLoadProjectDocument.mockResolvedValueOnce({
      version: 1,
      song: {
        id: "song-reopened-1",
        title: "Reopened rehearsal",
        sections: [],
        exportSummary: {
          format: "cue-sheet",
          headline: "Reopened app-owned rehearsal",
          focusSections: []
        }
      },
      preferences: {
        selectedPlaybackSource: "full_mix"
      },
      sourceReference: {
        projectId: "project-reopened-1"
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByTestId("workspace")).toBeTruthy();
    });

    const primaryNav = screen.getByRole("navigation", { name: /primary rehearsal views/i });
    fireEvent.click(within(primaryNav).getByRole("button", { name: /^Score$/i }));

    expect(screen.getByTestId("score-project-id")).toHaveTextContent("project-reopened-1");
  });
});
