import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { MAX_YOUTUBE_URL_LENGTH } from "./lib/analysis";

// The Score view pulls in ScoreViewer -> pdfjs-dist, which needs DOMMatrix
// (absent in jsdom). Stub the pdf.js bridge so App can mount the real
// ScoreView without loading the WebGL/canvas-heavy library.
vi.mock("./features/score/pdfjs", () => ({
  configureScorePdfWorker: vi.fn(),
  loadScorePdf: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 1, getPage: vi.fn() }),
    destroy: vi.fn(() => Promise.resolve())
  }))
}));

const tauriInvoke = vi.fn();
const mockLoadProject = vi.fn();
const mockSaveProject = vi.fn();
const mockSubscribeToAnalysisJobUpdates = vi.fn();
let mockLocalAudioSelectionResult: Record<string, unknown> | null = null;
let mockDemoAudioSelectionResult: Record<string, unknown> | null = null;
let mockImportYoutubeUrlError = false;
let latestStatusSubscription: ((payload: Record<string, unknown>) => void) | null = null;

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const tauriWindow = window as TauriWindow;

vi.mock("./lib/analysis", async (importActual) => {
  const actual = await importActual<typeof import("./lib/analysis")>();

  return {
    ...actual,
    importYoutubeUrl: async (url: string) => {
      if (mockImportYoutubeUrlError) {
        throw new Error("Simulated component crash");
      }
      return actual.importYoutubeUrl(url);
    },
    createDefaultAnalysisRequest: () => ({
      sourceKind: "demo",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
    }),
    selectLocalAudioSource: async () => mockLocalAudioSelectionResult ?? actual.selectLocalAudioSource(),
    selectDemoAudioSource: async () => mockDemoAudioSelectionResult ?? actual.selectDemoAudioSource(),
    subscribeToAnalysisJobUpdates: (...args: Parameters<typeof mockSubscribeToAnalysisJobUpdates>) =>
      mockSubscribeToAnalysisJobUpdates(...args),
    loadProject: () => mockLoadProject(),
    saveProject: (song: unknown) => mockSaveProject(song)
  };
});

function succeededResult() {
  return {
    jobId: "job-1",
    state: "succeeded",
    requestedAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:01.000Z",
    progressLabel: "Analysis ready",
    result: {
      id: "demo-song",
      title: "Late Night Set",
      sections: [
        {
          id: "verse-1",
          label: "verse",
          groove: "Straight eighths with a late snare feel",
          timeRange: { start: 10, end: 30 },
          confidence: {
            level: "medium",
            source: "model",
            notes: "Double-check the pickup into the chorus."
          },
          roles: [
            {
              id: "bass-guitar",
              name: "Bass Guitar",
              roleType: "instrument",
              harmony: {
                chord: "C#m7",
                functionLabel: "vi pedal anchor",
                source: "model"
              },
              cue: { kind: "transition", value: "Hold through the pickup before the downbeat." },
              range: { lowestNote: "C#2", highestNote: "E3" },
              confidence: { level: "medium", source: "model", notes: "Watch the slide into the turnaround." },
              rehearsalPriority: "high",
              simplification: "Stay on roots if the chorus entrance gets muddy.",
              setupNote: "Keep the attack short so the verse breathes.",
              manualOverrides: [],
              overlapWarnings: [
                "Density warning: competing with Keyboard Left Hand in low register."
              ]
            },
            {
              id: "lead-vocal",
              name: "Lead Vocal",
              roleType: "vocal",
              harmony: {
                chord: "C#m7",
                functionLabel: "vi melodic pull",
                source: "model"
              },
              cue: { kind: "lyric", value: "city lights" },
              range: { lowestNote: "G#3", highestNote: "C#5" },
              confidence: { level: "high", source: "user", notes: "Singer confirmed the pickup phrasing in rehearsal notes." },
              rehearsalPriority: "medium",
              simplification: "Keep the sustained note centered; skip the ad-lib on the first pass.",
              setupNote: "Watch the breath before the last line of the verse.",
              manualOverrides: [
                {
                  field: "harmony",
                  value: {
                    chord: "C#m11",
                    functionLabel: "vi suspended lift",
                    source: "user"
                  },
                  source: "user"
                }
              ],
              overlapWarnings: []
            }
          ],
          partGraph: [
            { role_id: "bass-guitar", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
            { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: ["bass-guitar"] }
          ]
        }
      ],
      exportSummary: {
        format: "cue-sheet",
        headline: "Start with verse entrances before the chorus lift.",
        focusSections: ["verse"]
      }
    }
  };
}

function bootstrapResponse(overrides: Record<string, unknown> = {}) {
  const source = {
    sourcePath: "/Users/test/Music/late-night-set.wav",
    fileName: "late-night-set.wav",
    extension: "wav",
    fileSizeBytes: 1024000
  };
  const { source: sourceOverride, ...restOverrides } = overrides;

  return {
    projectId: "project-1",
    sourceMode: "reference",
    projectRoot: "/tmp/bandscope/projects/project-1",
    cacheRoot: "/tmp/bandscope/cache/project-1",
    tempRoot: "/tmp/bandscope/temp/project-1",
    ...restOverrides,
    source: {
      ...source,
      ...((sourceOverride as Record<string, unknown> | undefined) ?? {})
    }
  };
}

function jobStatusResponse(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "job-1",
    state: "queued",
    requestedAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    progressLabel: "Queued for analysis",
    ...overrides
  };
}

function failedJobStatus(jobId: string, message: string) {
  return jobStatusResponse({
    jobId,
    state: "failed",
    error: {
      code: "engine_unavailable",
      message
    }
  });
}

describe("App", () => {
  beforeEach(() => {
    tauriInvoke.mockReset();
    mockLoadProject.mockReset();
    mockSaveProject.mockReset();
    mockSubscribeToAnalysisJobUpdates.mockReset();
    mockLocalAudioSelectionResult = null;
    mockDemoAudioSelectionResult = null;
    mockImportYoutubeUrlError = false;
    latestStatusSubscription = null;
    mockSubscribeToAnalysisJobUpdates.mockImplementation(
      async (_jobId: string, onUpdate: (status: Record<string, unknown>) => void) => {
        latestStatusSubscription = onUpdate;
        return () => {
          latestStatusSubscription = null;
        };
      }
    );
    delete tauriWindow.__TAURI_INTERNALS__;
    tauriWindow.__TAURI_INVOKE__ = tauriInvoke;
  });

  it("renders the rehearsal cockpit shell before analysis starts", () => {
    render(<App />);

    expect(screen.getByRole("img", { name: /BandScope circular equalizer mark/i })).toBeTruthy();
    expect(screen.getByText(/Your rehearsal map stays on this device/i)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: /primary rehearsal views/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Workspace Home/i })).toBeTruthy();
    expect(screen.getByText(/SYNCED • LOCAL/i)).toBeTruthy();
    expect(screen.getByText(/Turn a song into a practical rehearsal view\./i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Workspace$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Import$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Export$/i })).toBeTruthy();
    expect(fireEvent.click(screen.getByRole("button", { name: /settings coming soon/i }))).toBe(false);
    expect(fireEvent.click(screen.getByRole("button", { name: /help coming soon/i }))).toBe(false);
    const primaryNav = screen.getByRole("navigation", { name: /primary rehearsal views/i });
    const activePrimaryNavButton = within(primaryNav).getByRole("button", { name: "Workspace" });
    expect(activePrimaryNavButton).toHaveAttribute("aria-current", "page");
    for (const name of ["Import", "Export"]) {
      const navButton = within(primaryNav).getByRole("button", { name });
      expect(navButton).toHaveAttribute("aria-disabled", "true");
      expect(navButton).toHaveAttribute("title", "Coming soon");
      expect(navButton).not.toBeDisabled();
    }
    fireEvent.click(within(primaryNav).getByRole("button", { name: "Import" }));
    expect(activePrimaryNavButton).toHaveAttribute("aria-current", "page");
    const compactNav = screen.getByRole("navigation", { name: /compact rehearsal views/i });
    const activeCompactNavButton = within(compactNav).getByRole("button", { name: "Workspace compact view" });
    expect(activeCompactNavButton).toHaveAttribute("aria-current", "page");
    for (const name of ["Import", "Export"]) {
      const navButton = within(compactNav).getByRole("button", { name: `${name} compact view` });
      expect(navButton).toHaveAttribute("aria-disabled", "true");
      expect(navButton).toHaveAttribute("title", "Coming soon");
      expect(navButton).not.toBeDisabled();
    }
    fireEvent.click(within(compactNav).getByRole("button", { name: "Import compact view" }));
    expect(activeCompactNavButton).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/^Tempo$/i)).toBeTruthy();
    expect(screen.getByText(/^Key$/i)).toBeTruthy();
    expect(screen.getByText(/Local-first/i)).toBeTruthy();
    expect(screen.getByText(/Project files stay local/i)).toBeTruthy();
    expect(screen.getByText(/YouTube only leaves the app when you choose import/i)).toBeTruthy();
  });

  it("renders localized Korean shell copy for buyer-demo surfaces", () => {
    const languageSpy = vi.spyOn(window.navigator, "language", "get").mockReturnValue("ko-KR");

    try {
      render(<App />);

      expect(screen.getByRole("navigation", { name: /주요 합주 보기/i })).toBeTruthy();
      expect(screen.getByRole("heading", { name: /작업 공간 홈/i })).toBeTruthy();
      expect(screen.getByText(/동기화됨 • 로컬/i)).toBeTruthy();
      expect(screen.getByRole("button", { name: /^작업 공간$/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /프로젝트 열기/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /유튜브 가져오기/i })).toBeTruthy();
      expect(screen.getByText(/로컬 우선/i)).toBeTruthy();
      expect(screen.getByText(/합주 지도는 이 기기에 머뭅니다/i)).toBeTruthy();
      expect(screen.getByText(/^템포$/i)).toBeTruthy();
      expect(screen.queryByRole("heading", { name: /Workspace Home/i })).toBeNull();
    } finally {
      languageSpy.mockRestore();
    }
  });

  it("keeps source controls before the analysis summary", () => {
    render(<App />);

    const sourceControls = screen.getByLabelText("Source controls");
    const analysisSummary = screen.getByLabelText("Analysis summary");

    expect(sourceControls.compareDocumentPosition(analysisSummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sourceControls).toHaveTextContent(/Choose local audio/i);
    expect(sourceControls).toHaveTextContent(/Import YouTube/i);
  });

  it("caps the YouTube URL input before import-path validation", () => {
    render(<App />);

    expect(screen.getByRole("textbox", { name: /YouTube URL/i })).toHaveAttribute(
      "maxlength",
      String(MAX_YOUTUBE_URL_LENGTH)
    );
  });

  it("renders the loaded song as a dark rehearsal command board", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Song Timeline/i)).toBeTruthy();
    });
    expect(screen.getByText(/Roles & Harmony/i)).toBeTruthy();
    expect(screen.getByText(/Stems/i)).toBeTruthy();
    expect(screen.getByText(/Rehearsal Priorities/i)).toBeTruthy();
    expect(screen.getByText(/Export Cue Sheet/i)).toBeTruthy();
  });

  it("renders a rehearsal song structure timeline from real section ranges", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Song Structure/i })).toBeTruthy();
    });
    expect(screen.getByText(/verse · 0:10–0:30/i)).toBeTruthy();
    expect(screen.getByText(/Rehearsal timeline/i)).toBeTruthy();
    expect(screen.queryByText(/Mock-board/i)).toBeNull();
    const timelineRegion = screen.getByRole("region", { name: /scrollable song structure timeline/i });
    expect(timelineRegion.className).toContain("overflow-x-auto");
    expect(timelineRegion.getAttribute("tabindex")).toBe("0");
    expect(screen.queryByLabelText(/decorative waveform overview/i)).toBeNull();
  });

  it("does not show unavailable analysis metrics as detected facts", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    expect(screen.queryByText(/128 BPM/i)).toBeNull();
    expect(screen.queryByText(/E Major/i)).toBeNull();
    expect(screen.queryByText(/86%/i)).toBeNull();
    expect(screen.queryByText(/entry, dropout/i)).toBeNull();
    expect(screen.queryByText(/Preview-ready lanes/i)).toBeNull();
    expect(screen.getAllByText(/Pending/i).length).toBeGreaterThanOrEqual(2);
  });

  it("summarizes confidence from the lowest-confidence loaded section", async () => {
    const loadedProject = succeededResult().result;
    loadedProject.sections.push({
      ...loadedProject.sections[0],
      id: "chorus-1",
      label: "chorus",
      confidence: { level: "high", source: "model", notes: "The chorus form is clear." }
    });
    mockLoadProject.mockResolvedValueOnce(loadedProject);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/^Medium$/i)).toBeTruthy();
    });
    expect(screen.getAllByText(/2 sections/i).length).toBeGreaterThan(0);
  });

  it("short-circuits confidence evaluation when encountering a low confidence section", async () => {
    const loadedProject = succeededResult().result; // medium is first
    // Add low and high sections. High shouldn't matter since low is lowest.
    // And low will trigger the early break in the loop.
    loadedProject.sections.push(
      {
        ...loadedProject.sections[0],
        id: "bridge-1",
        label: "bridge",
        confidence: { level: "low", source: "model", notes: "Low confidence bridge" }
      },
      {
        ...loadedProject.sections[0],
        id: "outro-1",
        label: "outro",
        confidence: { level: "high", source: "model", notes: "High confidence outro" }
      }
    );
    mockLoadProject.mockResolvedValueOnce(loadedProject);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/^Low$/i)).toBeTruthy();
    });
    expect(screen.getAllByText(/3 sections/i).length).toBeGreaterThan(0);
  });

  it("selects a local audio source and starts a local-audio analysis job", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-local-1",
        state: "queued",
        progressLabel: "Queued for analysis"
      }))
      .mockResolvedValueOnce(succeededResult());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenNthCalledWith(2, "start_analysis_job", {
        request: {
          sourceKind: "local_audio",
          projectId: "project-1",
          sourceLabel: "late-night-set.wav",
          roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
        }
      });
    });
  });

  it("selects the licensed demo through the same local-audio bootstrap", async () => {
    tauriInvoke.mockResolvedValueOnce(bootstrapResponse());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /try the demo/i }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("select_demo_audio_source");
      expect(screen.getByText(/start analysis to open tonight's first cue/i)).toBeTruthy();
    });
  });

  it("names using your own song when the licensed demo cannot load", async () => {
    tauriInvoke.mockRejectedValueOnce(
      new Error("The licensed demo song could not be loaded. Use your own song to start tonight.")
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /try the demo/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/use your own song to start tonight/i);
    });
  });

  it("shows a safe file-intake error for unsupported local audio selection", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error("Choose a WAV, MP3, FLAC, or M4A file to start analysis."));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/choose a wav, mp3, flac, or m4a file/i)).toBeTruthy();
    });
    expect(screen.getByRole("alert").textContent).toMatch(/choose a wav, mp3, flac, or m4a file/i);
    expect(screen.queryByText(/analysis failed during execution/i)).toBeNull();
  });

  it("falls back to generic local-audio error copy when selection omits a message", async () => {
    mockLocalAudioSelectionResult = {
      ok: false,
      error: {
        code: "invalid_request",
        message: ""
      }
    };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/choose a wav, mp3, flac, or m4a file/i)).toBeTruthy();
    });
    expect(screen.queryByText(/analysis failed during execution/i)).toBeNull();
  });

  it("preserves safe file-read failure copy from the intake bridge", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error("Could not read the selected audio file."));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not read the selected audio file/i)).toBeTruthy();
    });
    expect(screen.queryByText(/analysis failed during execution/i)).toBeNull();
  });

  it("starts an analysis job and renders the returned rehearsal result", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-1",
        state: "queued",
        progressLabel: "Queued for analysis"
      }))
      .mockResolvedValueOnce(succeededResult());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/queued for analysis/i)).toBeTruthy();
    });
    expect(screen.getAllByRole("status").some((status) => /queued for analysis/i.test(status.textContent ?? ""))).toBe(true);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    expect(screen.getAllByText(/Bass Guitar/i).length).toBeGreaterThan(0);
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, "start_analysis_job", {
      request: {
        sourceKind: "local_audio",
        projectId: "project-1",
        sourceLabel: "late-night-set.wav",
        roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
      }
    });
  });

  it("shows the engine stage label and accessible progress value while analysis runs", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-progress-1",
        state: "running",
        progressLabel: "Separating stems... (45%)",
        progressStage: "separate",
        progressPercent: 45,
        cacheStatus: "miss"
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/separating stems/i)).toBeTruthy();
    });
    expect(screen.getByRole("progressbar", { name: /analysis progress/i })).toHaveAttribute(
      "aria-valuenow",
      "45"
    );
  });

  it("animates rendered progress toward the running job target", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-animated-progress",
        state: "running",
        progressLabel: undefined,
        progressPercent: 2
      }))
      .mockResolvedValue(jobStatusResponse({
        jobId: "job-animated-progress",
        state: "running",
        progressLabel: undefined,
        progressPercent: 2
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/running analysis/i)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByRole("progressbar", { name: /analysis progress/i })).toHaveAttribute(
        "aria-valuenow",
        "1"
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("progressbar", { name: /analysis progress/i })).toHaveAttribute(
        "aria-valuenow",
        "2"
      );
    });
  });

  it("uses translated progress labels when status payloads omit a progress label", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-unlabeled-status",
        state: "queued",
        progressLabel: undefined
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => {
      expect(screen.getAllByRole("status").some((status) => /queued for analysis/i.test(status.textContent ?? ""))).toBe(true);
    });
    await waitFor(() => {
      expect(mockSubscribeToAnalysisJobUpdates).toHaveBeenCalledWith(
        "job-unlabeled-status",
        expect.any(Function)
      );
    });

    const completed = succeededResult();
    delete (completed as { progressLabel?: string }).progressLabel;
    act(() => {
      latestStatusSubscription?.(completed);
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });
    expect(screen.getAllByRole("status").some((status) => /analysis ready/i.test(status.textContent ?? ""))).toBe(true);
  });

  it("falls back to failed progress copy when a pushed status has no error details", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-unlabeled-failure",
        state: "queued",
        progressLabel: undefined
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => {
      expect(mockSubscribeToAnalysisJobUpdates).toHaveBeenCalledWith(
        "job-unlabeled-failure",
        expect.any(Function)
      );
    });

    act(() => {
      latestStatusSubscription?.(jobStatusResponse({
        jobId: "job-unlabeled-failure",
        state: "failed",
        progressLabel: undefined
      }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/analysis could not start/i);
    });
    expect(screen.getAllByRole("status").some((status) => /analysis failed during execution/i.test(status.textContent ?? ""))).toBe(true);
  });

  it("holds a terminal progress value immediately for pushed failed statuses", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-terminal-progress",
        state: "queued",
        progressLabel: undefined,
        progressPercent: 10
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => {
      expect(mockSubscribeToAnalysisJobUpdates).toHaveBeenCalledWith(
        "job-terminal-progress",
        expect.any(Function)
      );
    });

    act(() => {
      latestStatusSubscription?.(jobStatusResponse({
        jobId: "job-terminal-progress",
        state: "failed",
        progressLabel: undefined,
        progressPercent: 100,
        error: {
          code: "engine_unavailable",
          message: "Analysis failed after separation."
        }
      }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/analysis failed after separation/i);
    });
    await waitFor(() => {
      expect(screen.getByRole("progressbar", { name: /analysis progress/i })).toHaveAttribute(
        "aria-valuenow",
        "100"
      );
    });
  });

  it("cleans up a late status subscription when the running view unmounts first", async () => {
    let resolveSubscription: ((cleanup: () => void) => void) | null = null;
    let pushedUpdate: ((status: Record<string, unknown>) => void) | null = null;
    const cleanup = vi.fn();
    mockSubscribeToAnalysisJobUpdates.mockImplementation(
      (_jobId: string, onUpdate: (status: Record<string, unknown>) => void) => new Promise<() => void>((resolve) => {
        pushedUpdate = onUpdate;
        resolveSubscription = resolve;
      })
    );
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-late-subscription",
        state: "queued",
        progressLabel: undefined
      }));

    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => {
      expect(mockSubscribeToAnalysisJobUpdates).toHaveBeenCalledWith(
        "job-late-subscription",
        expect.any(Function)
      );
    });

    unmount();
    act(() => {
      pushedUpdate?.(succeededResult());
    });
    await act(async () => {
      resolveSubscription?.(cleanup);
      await Promise.resolve();
    });

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("marks the active job failed when polling returns a malformed status", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-malformed-poll",
        state: "running",
        progressLabel: undefined
      }))
      .mockResolvedValueOnce({ jobId: "job-malformed-poll", state: "running" });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/analysis could not start/i);
    });
  });

  it("ignores malformed poll results after a pushed update changes the active job", async () => {
    let resolvePoll: ((value: unknown) => void) | null = null;
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-stale-invalid-poll",
        state: "running",
        progressLabel: undefined
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolvePoll = resolve;
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => expect(tauriInvoke).toHaveBeenCalledTimes(3));

    act(() => {
      latestStatusSubscription?.(succeededResult());
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });
    await act(async () => {
      resolvePoll?.({ jobId: "job-stale-invalid-poll", state: "running" });
      await Promise.resolve();
    });

    expect(screen.queryByText(/analysis could not start/i)).toBeNull();
  });

  it("ignores transport poll failures after a pushed update changes the active job", async () => {
    let rejectPoll: ((error: unknown) => void) | null = null;
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-stale-transport-poll",
        state: "running",
        progressLabel: undefined
      }))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {
        rejectPoll = reject;
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => expect(tauriInvoke).toHaveBeenCalledTimes(3));

    act(() => {
      latestStatusSubscription?.(succeededResult());
    });
    await act(async () => {
      rejectPoll?.(new Error("transport down"));
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    expect(screen.queryByText(/analysis could not start/i)).toBeNull();
  });

  it("applies pushed analysis status updates over the IPC event bridge", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-push-1",
        state: "queued",
        progressLabel: "Queued for analysis"
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => {
      expect(screen.getByText(/queued for analysis/i)).toBeTruthy();
    });
    await waitFor(() => {
      expect(mockSubscribeToAnalysisJobUpdates).toHaveBeenCalledWith(
        "job-push-1",
        expect.any(Function)
      );
    });

    act(() => {
      latestStatusSubscription?.(jobStatusResponse({
        jobId: "job-push-1",
        state: "running",
        progressLabel: "Separating stems... (45%)",
        progressStage: "separate",
        progressPercent: 45
      }));
    });
    await waitFor(() => {
      expect(screen.getByText(/separating stems/i)).toBeTruthy();
    });

    act(() => {
      latestStatusSubscription?.(succeededResult());
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });
  });

  it("keeps handoff metadata tied to the source that produced the current result", async () => {
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const createObjectUrl = vi.fn(() => "blob:handoff");
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl
    });

    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-1",
        state: "queued",
        progressLabel: "Queued for analysis"
      }))
      .mockResolvedValueOnce(succeededResult())
      .mockResolvedValueOnce(
        bootstrapResponse({
          projectId: "project-2",
          source: {
            sourcePath: "/Users/test/Music/next-song.wav",
            fileName: "next-song.wav",
            fileSizeBytes: 2048000
          }
        })
      );

    try {
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
      await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

      fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
      });

      fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
      await waitFor(() => expect(screen.getByText(/next-song\.wav/i)).toBeTruthy());

      fireEvent.click(screen.getByRole("button", { name: /export handoff/i }));
      const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
      const payload = JSON.parse(await blob.text());

      expect(payload.sourceAssets[0].fileName).toBe("late-night-set.wav");
      expect(JSON.stringify(payload)).not.toContain("next-song.wav");
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:handoff");
    } finally {
      click.mockRestore();
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectUrl
      });
    }
  });

  it("shows a safe failed status when the job poll returns an error", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-2",
        state: "running",
        progressLabel: "Running analysis"
      }))
      .mockResolvedValueOnce(failedJobStatus("job-2", "Analysis engine is unavailable."));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis engine is unavailable/i)).toBeTruthy();
    });
    expect(screen.getByRole("alert").textContent).toMatch(/analysis engine is unavailable/i);
  });

  it("falls back to a generic failure message when the engine omits details", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-3",
        state: "running",
        progressLabel: "Running analysis"
      }))
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-3",
        state: "failed",
        error: { code: "engine_unavailable" }
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis could not start/i)).toBeTruthy();
    });
  });

  it("keeps polling the active job when one polling request rejects", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-4",
        state: "running",
        progressLabel: "Running analysis"
      }))
      .mockRejectedValueOnce(new Error("transport down"))
      .mockResolvedValueOnce(succeededResult());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledTimes(3);
    });
    expect(screen.queryByText(/analysis could not start/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /start analysis/i }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });
  });

  it("shows a generic failure when starting the job rejects", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockRejectedValueOnce(new Error("invoke failed"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis could not start/i)).toBeTruthy();
    });
  });

  it("shows the direct failure message when start returns a failed job", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(failedJobStatus("job-5", "Analysis queue is full. Please wait for a running job to finish."));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis queue is full/i)).toBeTruthy();
    });
  });

  it("falls back to generic text when start returns a failed job without details", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-6",
        state: "failed"
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/analysis could not start/i).length).toBeGreaterThan(0);
    });
  });

  it("renders the result immediately when start returns a succeeded job", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(succeededResult());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/Section Roadmap/i)).toBeTruthy();
    });
    expect(tauriInvoke).toHaveBeenCalledTimes(2); // select + start
  });

  it("imports a YouTube URL successfully", async () => {
    tauriInvoke.mockResolvedValueOnce({
      projectId: "project-yt-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-yt-1",
      cacheRoot: "/tmp/bandscope/cache/project-yt-1",
      tempRoot: "/tmp/bandscope/temp/project-yt-1",
      source: {
        sourcePath: "/tmp/bandscope/temp/project-yt-1/youtube.wav",
        fileName: "youtube.wav",
        extension: "wav",
        fileSizeBytes: 5000000
      }
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=abc123DEF45" } });

    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("import_youtube_url", {
        url: "https://youtube.com/watch?v=abc123DEF45"
      });
      expect(screen.getByText(/youtube\.wav/i)).toBeTruthy();
    });
  });

  it("clears the YouTube URL without clearing local selection errors and returns focus to the input", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error("Choose a WAV, MP3, FLAC, or M4A file to start analysis."));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/choose a wav, mp3, flac, or m4a file/i);
    });

    const input = screen.getByRole("textbox", { name: /YouTube URL/i });
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=abc123DEF45" } });

    const clearButton = screen.getByRole("button", { name: /Clear YouTube URL/i });
    clearButton.focus();
    fireEvent.click(clearButton);

    expect(input).toHaveValue("");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: /Clear YouTube URL/i })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/choose a wav, mp3, flac, or m4a file/i);
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("handles YouTube import failure with a message", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error("This video is age restricted."));

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=def456GHI78" } });

    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/This video is age restricted/i);
      expect(alert).toHaveAttribute("id", "selection-error");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("aria-describedby", alert.id);
    });
  });

  it("handles generic exception during YouTube import", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error("Network Error"));

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=ghi789JKL01" } });

    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Network Error/i)).toBeTruthy();
    });
  });

  it("rejects empty YouTube URL", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "   " } });
    const button = screen.getByRole("button", { name: /Import YouTube/i });
    // Button is disabled if youtubeUrl is empty, but we simulate enabling it for coverage
    // or we can test that the error is set when it somehow triggers, but actually it's disabled.
    // Wait, the button is disabled if `!youtubeUrl`. `youtubeUrl` is "   ", so button is NOT disabled!
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });

  it("rejects malformed YouTube URL", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "not-a-url" } });
    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });

  it("rejects non-http YouTube URL", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "ftp://youtube.com/watch?v=abc123DEF45" } });
    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });

  it("rejects non-allowlisted YouTube URL intake before invoking the bridge", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://example.com/watch?v=abc123DEF45" } });

    fireEvent.click(screen.getByRole("button", { name: /Import YouTube/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("rejects downgraded YouTube URL intake before invoking the bridge", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "http://youtube.com/watch?v=abc123DEF45" } });

    fireEvent.click(screen.getByRole("button", { name: /Import YouTube/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("rejects duplicate YouTube video parameters even when one is blank", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=abc123DEF45&v=" } });

    fireEvent.click(screen.getByRole("button", { name: /Import YouTube/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
    expect(tauriInvoke).not.toHaveBeenCalled();
  });


  it("loads a project and updates the UI", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });
    expect(mockLoadProject).toHaveBeenCalledTimes(1);
  });

  it("handles loading a project failure safely", async () => {
    mockLoadProject.mockRejectedValueOnce(new Error("Corrupt file"));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to load project: Corrupt file/i)).toBeTruthy();
    });
  });

  it("ignores cancellation when loading a project", async () => {
    mockLoadProject.mockRejectedValueOnce(new Error("User cancelled"));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    // Should not show error, should remain in empty state
    await waitFor(() => {
      expect(mockLoadProject).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Failed to load project/i)).toBeNull();
    });
  });

  it("handles loading a project failure with string error gracefully", async () => {
    mockLoadProject.mockRejectedValueOnce("Unknown load error");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to load project: Unknown load error/i)).toBeTruthy();
    });
  });

  it("redacts local paths from project load failures", async () => {
    mockLoadProject.mockRejectedValueOnce(new Error("Could not open C:\\Users\\Seongho\\private-set.band\nstack detail"));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to load project: Could not open \[local path\]/i)).toBeTruthy();
    });
    const alertText = screen.getByRole("alert").textContent ?? "";
    expect(alertText).not.toMatch(/C:\\Users\\Seongho/i);
    expect(alertText).not.toMatch(/stack detail/i);
  });

  it("truncates oversized project load failure details", async () => {
    const longDetail = "A".repeat(260);
    mockLoadProject.mockRejectedValueOnce(new Error(longDetail));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    const truncatedDetail = `${longDetail.slice(0, 217)}...`;
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(`Failed to load project: ${truncatedDetail}`);
    });
  });

  it("ignores cancellation when loading a project with string error", async () => {
    mockLoadProject.mockRejectedValueOnce("User cancelled");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(mockLoadProject).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Failed to load project/i)).toBeNull();
    });
  });

  it("saves a project successfully", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockResolvedValueOnce(undefined);

    // Now click save
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(mockSaveProject).toHaveBeenCalledWith(succeededResult().result);
    });
  });

  it("handles saving a project failure gracefully", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockRejectedValueOnce(new Error("Permission denied"));

    // Now click save
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to save project: Permission denied/i)).toBeTruthy();
    });
  });

  it("ignores cancellation when saving a project with Error object", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockRejectedValueOnce(new Error("User cancelled"));

    // Now click save
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(mockSaveProject).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Failed to save project/i)).toBeNull();
    });
  });

  it("handles saving a project failure with string error gracefully", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockRejectedValueOnce("Disk full");

    // Now click save
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to save project: Disk full/i)).toBeTruthy();
    });
  });

  it("redacts links, local paths, and secret assignments from project save failures", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockRejectedValueOnce(
      new Error("Upload failed for https://example.com/report?token=abc access_token=secret123 at /Users/seongho/private.band")
    );

    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    let alertText = "";
    await waitFor(() => {
      alertText = screen.getByRole("alert").textContent ?? "";
      expect(alertText).toMatch(/Failed to save project:/i);
    });
    expect(alertText).toMatch(/\[link\]/i);
    expect(alertText).toMatch(/access_token=\[redacted\]/i);
    expect(alertText).toMatch(/\[local path\]/i);
    expect(alertText).not.toMatch(/example\.com|secret123|\/Users\/seongho/i);
  });

  it("ignores cancellation when saving a project with string error", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockRejectedValueOnce("User cancelled");

    // Now click save
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(mockSaveProject).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Failed to save project/i)).toBeNull();
    });
  });

  it("handles song update from workspace", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    // Mock prompt to simulate user entering a new chord
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Dbmaj7");

    // Click on the chord to edit it (assuming SectionRoadmap renders it and allows click to edit)
    fireEvent.click(screen.getAllByText("C#m7", { selector: 'button' })[0]);

    // Wait for the UI to update with the new chord (which verifies handleSongUpdate was called and state updated)
    await waitFor(() => {
      expect(screen.getAllByText("Dbmaj7").length).toBeGreaterThan(0);
    });

    promptSpy.mockRestore();
  });

  it("handles YouTube import failure with a missing message falling back to generic", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error(""));

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=def456GHI78" } });

    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });

  it("does nothing when Save Project is clicked but there is no jobResult", () => {
    render(<App />);
    const saveButton = screen.getByRole("button", { name: /save project/i });
    expect(saveButton).toHaveAttribute("aria-disabled", "true");
    expect(saveButton).not.toHaveAttribute("disabled");
    fireEvent.click(saveButton);
    expect(mockSaveProject).not.toHaveBeenCalled();
  });

  it("handles exception thrown by importYoutubeUrl itself", async () => {
    mockImportYoutubeUrlError = true;

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=crashing123" } });

    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });


  it("renders Settings and Help as focusable aria-disabled controls", () => {
    render(<App />);
    const settingsButton = screen.getByRole("button", { name: "Settings coming soon" });
    const helpButton = screen.getByRole("button", { name: "Help coming soon" });
    expect(settingsButton).toHaveAttribute("aria-disabled", "true");
    expect(settingsButton).not.toHaveAttribute("disabled");
    expect(helpButton).toHaveAttribute("aria-disabled", "true");
    expect(helpButton).not.toHaveAttribute("disabled");
  });

  it("keeps the Score view disabled until a song is loaded", () => {
    render(<App />);

    const scoreButtons = screen.getAllByRole("button", { name: /^Score$/i });
    expect(scoreButtons.length).toBeGreaterThan(0);
    for (const button of scoreButtons) {
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toHaveAttribute("disabled");
    }
    expect(screen.queryByRole("heading", { name: /Score · Late Night Set/i })).toBeNull();
  });

  it("switches to the Score view after a project is loaded", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByText(/Song Timeline/i)).toBeTruthy();
    });

    const scoreButton = screen.getAllByRole("button", { name: /^Score$/i })[0];
    expect(scoreButton).toBeEnabled();
    fireEvent.click(scoreButton);

    expect(await screen.findByRole("heading", { name: /Score · Late Night Set/i })).toBeInTheDocument();
    // Projects opened from a .bscope file have no live workspace, so score
    // storage is gated behind the active-project notice.
    expect(screen.getByText(/Scores attach to the active analysis project/i)).toBeInTheDocument();
    expect(screen.queryByText(/Song Timeline/i)).toBeNull();
  });

  it("switches to the Score view from the compact mobile navigation", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByText(/Song Timeline/i)).toBeTruthy();
    });

    // The compact nav is a separate rendered bar (shown on small viewports) with
    // its own set of buttons; exercise it directly so the mobile navigation path
    // is covered, not just the sidebar one.
    const compactNav = screen.getByRole("navigation", { name: /compact rehearsal views/i });
    const compactScoreButton = within(compactNav).getByRole("button", { name: /Score compact view/i });
    expect(compactScoreButton).toBeEnabled();

    fireEvent.click(compactScoreButton);

    expect(await screen.findByRole("heading", { name: /Score · Late Night Set/i })).toBeInTheDocument();
    expect(screen.queryByText(/Song Timeline/i)).toBeNull();
  });
});
