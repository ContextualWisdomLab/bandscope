import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MetadataHandoffArtifact, ProjectBootstrapSummary } from "@bandscope/shared-types";
import { App } from "./App";
import {
  selectLocalAudioSource,
  startAnalysisJob
} from "./lib/analysis";
import { readMetadataHandoffFile } from "./lib/handoff";

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

const mockedSelectLocalAudioSource = vi.mocked(selectLocalAudioSource);
const mockedStartAnalysisJob = vi.mocked(startAnalysisJob);
const mockedReadMetadataHandoffFile = vi.mocked(readMetadataHandoffFile);

function handoff(): MetadataHandoffArtifact {
  return {
    artifactKind: "bandscope.metadata-handoff",
    artifactVersion: 1,
    createdAt: "2026-08-03T03:20:00.000Z",
    workspace: { id: "workspace-1", title: "Friday rehearsal", workspaceVersion: 1 },
    song: {
      id: "song-1",
      title: "Late Night Set",
      exportSummary: {
        format: "cue-sheet",
        headline: "Start with the chorus entrance.",
        focusSections: ["chorus"]
      }
    },
    sections: [
      {
        id: "verse-1",
        label: "verse",
        timeRange: { start: 0, end: 30 },
        confidence: { level: "medium", source: "model", notes: "" },
        roleBuckets: [
          {
            id: "bass-guitar",
            name: "Bass Guitar",
            roleType: "instrument",
            confidence: { level: "high", source: "model", notes: "" },
            rehearsalPriority: "high"
          },
          {
            id: "lead-vocal",
            name: "Lead Vocal",
            roleType: "vocal",
            confidence: { level: "medium", source: "model", notes: "" },
            rehearsalPriority: "medium"
          }
        ]
      }
    ],
    sourceAssets: []
  };
}

function selectedSource(): ProjectBootstrapSummary {
  return {
    projectId: "recipient-project",
    sourceMode: "reference",
    projectRoot: "/tmp/bandscope/projects/recipient-project",
    cacheRoot: "/tmp/bandscope/cache/recipient-project",
    tempRoot: "/tmp/bandscope/temp/recipient-project",
    source: {
      sourcePath: "/Users/recipient/Music/late-night-set.wav",
      fileName: "late-night-set.wav",
      extension: "wav",
      fileSizeBytes: 1_024_000
    }
  };
}

function uploadFile(): File {
  return new File(["{}"], "friday-handoff.json", { type: "application/json" });
}

describe("App handoff round trip", () => {
  beforeEach(() => {
    mockedSelectLocalAudioSource.mockReset();
    mockedStartAnalysisJob.mockReset();
    mockedReadMetadataHandoffFile.mockReset();
    mockedSelectLocalAudioSource.mockResolvedValue({
      ok: true,
      bootstrap: selectedSource()
    });
    mockedStartAnalysisJob.mockResolvedValue({
      jobId: "job-1",
      state: "queued",
      requestedAt: "2026-08-03T03:20:00.000Z",
      updatedAt: "2026-08-03T03:20:00.000Z",
      progressLabel: "Queued for analysis"
    });
  });

  it("starts focused reanalysis only after the recipient selects local audio", async () => {
    mockedReadMetadataHandoffFile.mockResolvedValueOnce({
      ok: true,
      fileName: "friday-handoff.json",
      artifact: handoff(),
      roleFocus: ["bass-guitar", "lead-vocal"]
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: { files: [uploadFile()] }
    });
    await screen.findByText("Friday rehearsal");
    expect(mockedStartAnalysisJob).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText("late-night-set.wav")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /^start analysis$/i }));

    await waitFor(() => {
      expect(mockedStartAnalysisJob).toHaveBeenCalledWith({
        sourceKind: "local_audio",
        projectId: "recipient-project",
        sourceLabel: "late-night-set.wav",
        roleFocus: ["bass-guitar", "lead-vocal"]
      });
    });
  });

  it("uses the normal role focus after the imported handoff is cleared", async () => {
    mockedReadMetadataHandoffFile.mockResolvedValueOnce({
      ok: true,
      fileName: "friday-handoff.json",
      artifact: handoff(),
      roleFocus: ["bass-guitar", "lead-vocal"]
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: { files: [uploadFile()] }
    });
    await screen.findByText("Friday rehearsal");
    fireEvent.click(screen.getByRole("button", { name: /clear imported handoff/i }));
    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText("late-night-set.wav")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /^start analysis$/i }));

    await waitFor(() => {
      expect(mockedStartAnalysisJob).toHaveBeenCalledWith({
        sourceKind: "local_audio",
        projectId: "recipient-project",
        sourceLabel: "late-night-set.wav",
        roleFocus: ["keys-right"]
      });
    });
  });

  it("shows bounded handoff validation errors without exposing file payloads", async () => {
    mockedReadMetadataHandoffFile.mockResolvedValueOnce({
      ok: false,
      code: "too_large"
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: { files: [uploadFile()] }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /handoff file is too large/i
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/friday-handoff.json/i);
  });
});
