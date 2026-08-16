import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MetadataHandoffArtifact,
  ProjectBootstrapSummary,
  RehearsalSong
} from "@bandscope/shared-types";
import { App } from "./App";
import {
  importYoutubeUrl,
  selectLocalAudioSource,
  startAnalysisJob,
  subscribeToAnalysisJobUpdates
} from "./lib/analysis";
import {
  readMetadataHandoffFile,
  type HandoffImportErrorCode
} from "./lib/handoff";

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

const mockedImportYoutubeUrl = vi.mocked(importYoutubeUrl);
const mockedSelectLocalAudioSource = vi.mocked(selectLocalAudioSource);
const mockedStartAnalysisJob = vi.mocked(startAnalysisJob);
const mockedSubscribeToAnalysisJobUpdates = vi.mocked(subscribeToAnalysisJobUpdates);
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

function succeededSong(): RehearsalSong {
  return {
    id: "song-result",
    title: "Late Night Set",
    sections: [],
    exportSummary: {
      format: "cue-sheet",
      headline: "Focused rehearsal is ready.",
      focusSections: []
    }
  } as RehearsalSong;
}

function uploadFile(name = "friday-handoff.json"): File {
  return new File(["{}"], name, { type: "application/json" });
}

async function importValidHandoff(): Promise<void> {
  mockedReadMetadataHandoffFile.mockResolvedValueOnce({
    ok: true,
    fileName: "friday-handoff.json",
    artifact: handoff(),
    roleFocus: ["bass-guitar", "lead-vocal"]
  });
  fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
    target: { files: [uploadFile()] }
  });
  await screen.findByText("Friday rehearsal");
}

async function selectLocalSource(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
  await waitFor(() => {
    expect(screen.getByText("late-night-set.wav")).toBeTruthy();
  });
}

describe("App handoff round trip", () => {
  beforeEach(() => {
    mockedImportYoutubeUrl.mockReset();
    mockedSelectLocalAudioSource.mockReset();
    mockedStartAnalysisJob.mockReset();
    mockedSubscribeToAnalysisJobUpdates.mockReset();
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
    mockedSubscribeToAnalysisJobUpdates.mockResolvedValue(() => undefined);
  });

  it("starts focused reanalysis only after the recipient selects local audio", async () => {
    render(<App />);

    await importValidHandoff();
    expect(mockedStartAnalysisJob).not.toHaveBeenCalled();

    await selectLocalSource();
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

  it("keeps YouTube unavailable while a validated handoff awaits local audio", async () => {
    render(<App />);

    const youtubeInput = screen.getByLabelText(/youtube url/i);
    fireEvent.change(youtubeInput, { target: { value: "https://youtu.be/rehearsal" } });
    expect(screen.getByRole("button", { name: /import youtube/i })).not.toBeDisabled();

    await importValidHandoff();

    expect(youtubeInput).toBeDisabled();
    expect(screen.getByRole("button", { name: /import youtube/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /import youtube/i }));
    expect(mockedImportYoutubeUrl).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /choose local audio/i })).not.toBeDisabled();
  });

  it("requires explicit source re-selection when a new handoff replaces prior context", async () => {
    render(<App />);

    await selectLocalSource();
    expect(screen.getByRole("button", { name: /^start analysis$/i })).not.toBeDisabled();

    await importValidHandoff();

    expect(screen.queryByText("late-night-set.wav")).toBeNull();
    expect(screen.getByRole("button", { name: /^start analysis$/i })).toBeDisabled();
    expect(mockedStartAnalysisJob).not.toHaveBeenCalled();

    await selectLocalSource();
    expect(screen.getByRole("button", { name: /^start analysis$/i })).not.toBeDisabled();
  });

  it("uses the normal role focus after the imported handoff is cleared", async () => {
    render(<App />);

    await importValidHandoff();
    fireEvent.click(screen.getByRole("button", { name: /clear imported handoff/i }));
    await selectLocalSource();
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

  it.each<[HandoffImportErrorCode, RegExp]>([
    ["unsupported_file", /choose a BandScope handoff JSON file/i],
    ["too_large", /handoff file is too large/i],
    ["invalid_utf8", /handoff file is not valid UTF-8 text/i],
    ["invalid_json", /handoff file is not valid JSON/i],
    ["invalid_artifact", /file is not a supported BandScope handoff/i],
    ["read_failed", /handoff file could not be read/i]
  ])("shows payload-free localized copy for %s", async (code, expectedCopy) => {
    mockedReadMetadataHandoffFile.mockResolvedValueOnce({ ok: false, code });
    render(<App />);

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: { files: [uploadFile("private-rehearsal-secret.json")] }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(expectedCopy);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/private-rehearsal-secret/i);
  });

  it("blocks competing source actions while a handoff is being validated", async () => {
    let resolveImport: ((value: Awaited<ReturnType<typeof readMetadataHandoffFile>>) => void) | null =
      null;
    mockedReadMetadataHandoffFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        })
    );
    render(<App />);

    const youtubeInput = screen.getByLabelText(/youtube url/i);
    fireEvent.change(youtubeInput, { target: { value: "https://youtu.be/rehearsal" } });
    expect(screen.getByRole("button", { name: /import youtube/i })).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: { files: [uploadFile()] }
    });

    expect(await screen.findByRole("button", { name: /validating handoff/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /choose local audio/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /import youtube/i })).toBeDisabled();
    expect(youtubeInput).toBeDisabled();
    expect(mockedSelectLocalAudioSource).not.toHaveBeenCalled();

    resolveImport?.({ ok: false, code: "invalid_artifact" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /choose local audio/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /import youtube/i })).not.toBeDisabled();
      expect(youtubeInput).not.toBeDisabled();
    });
  });

  it("blocks project replacement while a handoff is being validated", async () => {
    let resolveImport: ((value: Awaited<ReturnType<typeof readMetadataHandoffFile>>) => void) | null =
      null;
    mockedReadMetadataHandoffFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        })
    );
    render(<App />);

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: { files: [uploadFile()] }
    });

    expect(await screen.findByRole("button", { name: /validating handoff/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /open project/i })).toBeDisabled();

    resolveImport?.({ ok: false, code: "invalid_artifact" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open project/i })).not.toBeDisabled();
    });
  });

  it("clears a prior handoff error after a replacement validates", async () => {
    mockedReadMetadataHandoffFile
      .mockResolvedValueOnce({ ok: false, code: "invalid_json" })
      .mockResolvedValueOnce({
        ok: true,
        fileName: "friday-handoff.json",
        artifact: handoff(),
        roleFocus: ["bass-guitar", "lead-vocal"]
      });
    render(<App />);

    const input = screen.getByLabelText(/handoff JSON file/i);
    fireEvent.change(input, { target: { files: [uploadFile("broken.json")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/not valid JSON/i);

    fireEvent.change(input, { target: { files: [uploadFile()] } });
    await screen.findByText("Friday rehearsal");
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("clears a prior local-source error after a handoff validates", async () => {
    mockedSelectLocalAudioSource.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Choose a WAV, MP3, FLAC, or M4A file to start analysis."
      }
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/choose a WAV, MP3, FLAC, or M4A/i);

    await importValidHandoff();
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("clears the pending handoff after an immediately completed analysis", async () => {
    mockedStartAnalysisJob.mockResolvedValueOnce({
      jobId: "job-immediate",
      state: "succeeded",
      requestedAt: "2026-08-03T03:20:00.000Z",
      updatedAt: "2026-08-03T03:20:01.000Z",
      progressLabel: "Analysis complete",
      progressPercent: 100,
      result: succeededSong()
    });
    render(<App />);

    await importValidHandoff();
    await selectLocalSource();
    fireEvent.click(screen.getByRole("button", { name: /^start analysis$/i }));

    expect(await screen.findByText("Workspace result")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText("Friday rehearsal")).toBeNull();
      expect(screen.getByRole("button", { name: /import handoff/i })).toBeTruthy();
    });
  });

  it("clears the pending handoff when a subscribed job completes", async () => {
    mockedSubscribeToAnalysisJobUpdates.mockImplementationOnce(async (_jobId, onStatus) => {
      onStatus({
        jobId: "job-1",
        state: "succeeded",
        requestedAt: "2026-08-03T03:20:00.000Z",
        updatedAt: "2026-08-03T03:20:02.000Z",
        progressLabel: "Analysis complete",
        progressPercent: 100,
        result: succeededSong()
      });
      return () => undefined;
    });
    render(<App />);

    await importValidHandoff();
    await selectLocalSource();
    fireEvent.click(screen.getByRole("button", { name: /^start analysis$/i }));

    expect(await screen.findByText("Workspace result")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText("Friday rehearsal")).toBeNull();
      expect(screen.getByRole("button", { name: /import handoff/i })).toBeTruthy();
    });
  });
});
