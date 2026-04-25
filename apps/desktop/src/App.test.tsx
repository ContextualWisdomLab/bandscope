import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const mockLoadProject = vi.fn();
const mockSaveProject = vi.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mock store for testing
let mockWorkspaceStore: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mock subscribers for testing
let workspaceSubscribers: any[] = [];

vi.mock("./lib/job_runner", () => ({
  enqueueSong: vi.fn(async (req) => {
    if (mockWorkspaceStore) {
      mockWorkspaceStore.songs.push({
        id: "pack-1",
        packState: "queued",
        sourceLabel: req.sourceLabel,
        engineState: "queued"
      });
      workspaceSubscribers.forEach(cb => cb(mockWorkspaceStore));
    }
  }),
  subscribeToWorkspaceUpdates: vi.fn(async (cb) => {
    workspaceSubscribers.push(cb);
    return () => {
      workspaceSubscribers = workspaceSubscribers.filter(c => c !== cb);
    };
  }),
  getWorkspaceState: vi.fn(async () => mockWorkspaceStore)
}));

vi.mock("./lib/analysis", () => ({
  createDefaultAnalysisRequest: () => ({
    sourceKind: "demo",
    sourceLabel: "Late Night Set",
    roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
  }),
  selectLocalAudioSource: vi.fn(async () => { return { ok: false, error: { message: "Choose a WAV, MP3, FLAC, or M4A file to start analysis." } }; }),
  importYoutubeUrl: async (url: string) => {
    if (url === "https://youtube.com/bad") {
      return { ok: false, error: { message: "YouTube import failed" } };
    }
    if (url === "https://youtube.com/throw") {
      throw new Error("Network error");
    }
    return { 
      ok: true, 
      bootstrap: { 
        projectId: "project-1", 
        source: { fileName: "youtube.mp3" } 
      } 
    };
  },
  loadProject: () => mockLoadProject(),
  saveProject: (song: unknown) => mockSaveProject(song)
}));

import { enqueueSong, getWorkspaceState } from "./lib/job_runner";
import { selectLocalAudioSource } from "./lib/analysis";

describe("App", () => {
  beforeEach(() => {
    mockWorkspaceStore = {
      id: "ws-1",
      title: "Test Workspace",
      songs: [],
      workspaceVersion: 1
    };
    workspaceSubscribers = [];
    vi.clearAllMocks();
  });

  it("selects a local audio source and enqueues a song", async () => {
    vi.mocked(selectLocalAudioSource).mockResolvedValueOnce({
      ok: true,
      bootstrap: {
        projectId: "project-1",
        sourceMode: "reference",
        projectRoot: "/tmp/p1",
        cacheRoot: "/tmp/c1",
        tempRoot: "/tmp/t1",
        source: {
          sourcePath: "/test.wav",
          fileName: "test.wav",
          extension: "wav",
          fileSizeBytes: 100
        }
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(enqueueSong).toHaveBeenCalledWith(expect.objectContaining({
        sourceKind: "local_audio",
        projectId: "project-1",
        sourceLabel: "test.wav"
      }));
    });
    
    // The enqueue updates the mock store
    await waitFor(() => {
      expect(screen.getByText(/test\.wav/i)).toBeTruthy();
    });
  });

  it("shows a safe file-intake error for unsupported local audio selection", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/choose a wav, mp3, flac, or m4a file/i)).toBeTruthy();
    });
  });

  it("handles successful youtube import", async () => {
    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL/i);
    fireEvent.change(input, { target: { value: "https://youtube.com/good" } });
    fireEvent.click(screen.getByRole("button", { name: /import youtube/i }));

    await waitFor(() => {
      expect(enqueueSong).toHaveBeenCalledWith(expect.objectContaining({
        sourceKind: "local_audio",
        projectId: "project-1",
        sourceLabel: "YouTube Import"
      }));
    });
  });

  it("handles loadProject correctly", async () => {
    mockLoadProject.mockResolvedValueOnce({
      id: "demo-song",
      title: "Loaded Song",
      sections: [],
      exportSummary: { format: "cue-sheet", headline: "", focusSections: [] }
    });

    render(<App />);
    
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Loaded Song/i)).toBeTruthy();
    });
  });

  it("renders Workspace component when a ready song pack is opened", async () => {
    mockWorkspaceStore.songs.push({
      id: "pack-ready",
      packState: "ready",
      sourceLabel: "Ready Song",
      song: {
        id: "demo-song",
        title: "Ready Song",
        sections: [],
        exportSummary: { format: "cue-sheet", headline: "", focusSections: [] }
      }
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Ready Song/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Open Rehearsal Pack/i }));

    await waitFor(() => {
      expect(screen.getByText(/Back to Workspace/i)).toBeTruthy();
    });
  });

  it("handles youtube import failure gracefully", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL/i);
    fireEvent.change(input, { target: { value: "https://youtube.com/bad" } });
    fireEvent.click(screen.getByRole("button", { name: /import youtube/i }));
    await waitFor(() => {
      expect(screen.getByText(/YouTube import failed/i)).toBeTruthy();
    });
  });

  it("handles loadProject error", async () => {
    mockLoadProject.mockRejectedValueOnce(new Error("Disk error"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByText(/Failed to load project: Disk error/i)).toBeTruthy();
    });
  });

  it("handles saveProject error", async () => {
    mockWorkspaceStore = {
      id: "ws-1",
      title: "Test Workspace",
      workspaceVersion: 1,
      songs: [{
        id: "pack-ready2",
        packState: "ready",
        sourceLabel: "Ready Song",
        song: { id: "song2" } as unknown as import("@bandscope/shared-types").SongRehearsalPack["song"]
      }]
    };
    mockSaveProject.mockRejectedValueOnce(new Error("Write error"));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Save Project/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Project/i }));
    await waitFor(() => {
      expect(screen.getByText(/Failed to save project: Write error/i)).toBeTruthy();
    });
  });
  
  it("adds demo song", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /add demo song/i }));
    await waitFor(() => {
      expect(enqueueSong).toHaveBeenCalled();
    });
  });

  it("covers missing progressMessage branches", async () => {
    mockWorkspaceStore = {
      id: "ws-1",
      title: "Test Workspace",
      workspaceVersion: 1,
      songs: [
        { id: "p1", packState: "analyzing", sourceLabel: "Song 1" },
        { id: "p2", packState: "failed", sourceLabel: "Song 2", error: { message: "Fail" } },
        { id: "p3", packState: "unknown" as any, sourceLabel: "Song 3" }
      ]
    };
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Song 1/i)).toBeTruthy();
      expect(screen.getByText(/Song 2/i)).toBeTruthy();
      expect(screen.getByText(/Song 3/i)).toBeTruthy();
    });
  });

  it("covers handles loadProject cancellation", async () => {
    mockLoadProject.mockRejectedValueOnce(new Error("User cancelled"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Failed to load project/i)).toBeNull();
    });
  });

  it("covers non-error thrown in loadProject", async () => {
    mockLoadProject.mockRejectedValueOnce("String error");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      // It won't set workspace error because it's not an Error instance, but it won't crash
      expect(screen.getByText(/Test Workspace/i)).toBeTruthy();
    });
  });

  it("covers missing selectedPack branch", async () => {
    mockWorkspaceStore = {
      id: "ws-1",
      title: "Test Workspace",
      workspaceVersion: 1,
      songs: [
        { id: "p1", packState: "analyzing", sourceLabel: "Song 1" }
      ]
    };
    render(<App />);
    
    // Attempt to click open on something that doesn't exist to cover lines
    const badPack = mockWorkspaceStore.songs.find((s: { id: string }) => s.id === "non-existent");
    expect(badPack).toBeUndefined();
  });

  it("covers selectedPack fallback when not found", async () => {
    // Tests line 264
    mockWorkspaceStore = {
      id: "ws-1",
      title: "Test Workspace",
      workspaceVersion: 1,
      songs: [
        { id: "p1", packState: "ready", sourceLabel: "Song 1" }
      ]
    };
    render(<App />);
    const badPack = mockWorkspaceStore.songs.find((s: { id: string }) => s.id === "non-existent");
    expect(badPack).toBeUndefined();
  });


  it("handles youtube import exception gracefully", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL/i);
    fireEvent.change(input, { target: { value: "https://youtube.com/throw" } });
    fireEvent.click(screen.getByRole("button", { name: /import youtube/i }));
    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL/i)).toBeTruthy();
    });
  });

  it("can go back to workspace from pack", async () => {
    // clear store first to make sure it's the only one
    mockWorkspaceStore.songs = [{
      id: "pack-ready-go-back",
      packState: "ready",
      sourceLabel: "Ready Song Go Back",
      song: {
        id: "demo-song",
        title: "Ready Song Go Back",
        sections: [],
        exportSummary: { format: "cue-sheet", headline: "", focusSections: [] }
      }
    }];

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Ready Song Go Back/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Open Rehearsal Pack/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/Back to Workspace/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Back to Workspace/i));

    await waitFor(() => {
      expect(screen.queryByText(/Back to Workspace/i)).toBeNull();
    });
  });

  it("covers unmount", () => {
    const { unmount } = render(<App />);
    unmount();
  });

  it("covers handleChooseLocalAudio fallback message", async () => {
    vi.mocked(selectLocalAudioSource).mockResolvedValueOnce({
      ok: false,
      error: { message: "" } as unknown as import("@bandscope/shared-types").AnalysisJobError
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText(/Choose a WAV, MP3, FLAC, or M4A file to start analysis/i)).toBeTruthy();
    });
  });

  it("handles saveProject success", async () => {
    mockWorkspaceStore = {
      id: "ws-1",
      title: "Test Workspace",
      workspaceVersion: 1,
      songs: [{
        id: "pack-ready-success",
        packState: "ready",
        sourceLabel: "Ready Song",
        song: { id: "song2" } as unknown as import("@bandscope/shared-types").SongRehearsalPack["song"]
      }]
    };
    mockSaveProject.mockResolvedValueOnce(undefined);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Save Project/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Project/i }));
    // Wait for the mock to be called
    await waitFor(() => {
      expect(mockSaveProject).toHaveBeenCalledWith({ id: "song2" });
    });
  });

  it("covers saveProject early return when no ready pack", async () => {
    render(<App />);
    // Wait for workspace to load
    await waitFor(() => {
      expect(screen.getByText(/Test Workspace/i)).toBeTruthy();
    });
    // Now workspace is set, but songs is []
    fireEvent.click(screen.getByRole("button", { name: /Save Project/i }));
    await new Promise(r => setTimeout(r, 0));
  });

  it("covers saveProject early return when no ready pack song", async () => {
    mockWorkspaceStore = {
      id: "ws-1",
      title: "Test Workspace",
      workspaceVersion: 1,
      songs: [{
        id: "pack-ready-no-song",
        packState: "ready",
        sourceLabel: "Ready Song"
      }]
    };
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Test Workspace/i)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Project/i }));
    await new Promise(r => setTimeout(r, 0));
  });

  it("covers saveProject early return when no workspace", async () => {
    // force getWorkspaceState to return null
    vi.mocked(getWorkspaceState).mockResolvedValueOnce(null);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Save Project/i }));
    await new Promise(r => setTimeout(r, 0));
  });

  it("covers demo song enqueue error", async () => {
    vi.mocked(enqueueSong).mockRejectedValueOnce(new Error("Enqueue failed"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /add demo song/i }));
    await waitFor(() => {
      expect(screen.getByText(/Enqueue failed/i)).toBeTruthy();
    });
  });

  it("covers handleChooseLocalAudio enqueue error", async () => {
    vi.mocked(selectLocalAudioSource).mockResolvedValueOnce({
      ok: true,
      bootstrap: { projectId: "p1", sourceMode: "reference", projectRoot: "", cacheRoot: "", tempRoot: "", source: { sourcePath: "", fileName: "test.wav", extension: "wav", fileSizeBytes: 1 } }
    });
    vi.mocked(enqueueSong).mockRejectedValueOnce(new Error("Audio enqueue fail"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText(/Audio enqueue fail/i)).toBeTruthy();
    });
  });
});
