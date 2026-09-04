import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./features/score/pdfjs", () => ({
  configureScorePdfWorker: vi.fn(),
  loadScorePdf: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 1, getPage: vi.fn() }),
    destroy: vi.fn(() => Promise.resolve())
  }))
}));

const tauriInvoke = vi.fn();
const mockSubscribeToAnalysisJobUpdates = vi.fn();
let latestStatusSubscription: ((payload: Record<string, unknown>) => void) | null = null;

type TauriWindow = Window & {
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const tauriWindow = window as TauriWindow;

vi.mock("./lib/analysis", async (importActual) => {
  const actual = await importActual<typeof import("./lib/analysis")>();
  return {
    ...actual,
    createDefaultAnalysisRequest: () => ({
      sourceKind: "demo",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar"]
    }),
    subscribeToAnalysisJobUpdates: (...args: Parameters<typeof mockSubscribeToAnalysisJobUpdates>) =>
      mockSubscribeToAnalysisJobUpdates(...args)
  };
});

function bootstrapResponse() {
  return {
    projectId: "project-duplicate-completion",
    sourceMode: "reference",
    projectRoot: "/tmp/bandscope/projects/project-duplicate-completion",
    cacheRoot: "/tmp/bandscope/cache/project-duplicate-completion",
    tempRoot: "/tmp/bandscope/temp/project-duplicate-completion",
    source: {
      sourcePath: "/Users/test/Music/duplicate-completion.wav",
      fileName: "duplicate-completion.wav",
      extension: "wav",
      fileSizeBytes: 1024000
    }
  };
}

function queuedStatus() {
  return {
    jobId: "job-duplicate-completion",
    state: "queued",
    requestedAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    progressLabel: "Queued for analysis"
  };
}

function succeededStatus() {
  return {
    jobId: "job-duplicate-completion",
    state: "succeeded",
    requestedAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:01.000Z",
    progressLabel: "Analysis ready",
    result: {
      id: "duplicate-completion-song",
      title: "Late Night Set",
      sections: [
        {
          id: "verse-1",
          label: "verse",
          groove: "Straight eighths",
          timeRange: { start: 10, end: 30 },
          confidence: { level: "high", source: "model", notes: "Stable entrance." },
          roles: [
            {
              id: "bass-guitar",
              name: "Bass Guitar",
              roleType: "instrument",
              harmony: { chord: "C", functionLabel: "tonic", source: "model" },
              cue: { kind: "transition", value: "Enter on beat one." },
              range: { lowestNote: "C2", highestNote: "G3" },
              confidence: { level: "high", source: "model", notes: "Stable entrance." },
              rehearsalPriority: "high",
              simplification: "Stay on roots.",
              setupNote: "Short attack.",
              manualOverrides: [],
              overlapWarnings: [],
              hitPlan: "Hit on beat one.",
              hitPlanSource: "user"
            }
          ],
          partGraph: [
            { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }
          ]
        }
      ],
      exportSummary: {
        format: "cue-sheet",
        headline: "Land the first entrance.",
        focusSections: ["verse"]
      }
    }
  };
}

describe("App duplicate terminal analysis delivery", () => {
  beforeEach(() => {
    tauriInvoke.mockReset();
    mockSubscribeToAnalysisJobUpdates.mockReset();
    latestStatusSubscription = null;
    mockSubscribeToAnalysisJobUpdates.mockImplementation(
      async (_jobId: string, onUpdate: (status: Record<string, unknown>) => void) => {
        latestStatusSubscription = onUpdate;
        return () => {
          latestStatusSubscription = null;
        };
      }
    );
    tauriWindow.__TAURI_INVOKE__ = tauriInvoke;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
  });

  it("keeps an opened hit plan armed when event and poll deliver the same completed job", async () => {
    let resolvePoll: ((value: unknown) => void) | null = null;
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(queuedStatus())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePoll = resolve;
          })
      );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await screen.findByText(/duplicate-completion\.wav/i);
    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(mockSubscribeToAnalysisJobUpdates).toHaveBeenCalledWith(
        "job-duplicate-completion",
        expect.any(Function)
      );
    });
    await waitFor(() => expect(tauriInvoke).toHaveBeenCalledTimes(3));

    act(() => {
      latestStatusSubscription?.(succeededStatus());
    });
    const openHitPlan = await screen.findByRole("button", {
      name: /open bass guitar hit at 0:10/i
    });
    fireEvent.click(openHitPlan);
    expect(
      screen.getByText(/land that hit on bass guitar at 0:10 before the room starts/i)
    ).toBeTruthy();

    await act(async () => {
      resolvePoll?.(succeededStatus());
      await Promise.resolve();
    });

    expect(
      screen.getByText(/land that hit on bass guitar at 0:10 before the room starts/i)
    ).toBeTruthy();
  });
});
