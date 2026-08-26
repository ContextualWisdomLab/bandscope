import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { RehearsalRole, RehearsalSong } from "@bandscope/shared-types";
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

vi.mock("./lib/analysis", async (importActual) => {
  const actual = await importActual<typeof import("./lib/analysis")>();
  return {
    ...actual,
    loadProject: () => mockLoadProject()
  };
});

function role(id: string, name: string): RehearsalRole {
  return {
    id,
    name,
    roleType: "instrument",
    harmony: {
      chord: "C",
      functionLabel: "tonic",
      source: "model"
    },
    cue: {
      kind: "transition",
      value: "Enter on one"
    },
    range: {
      lowestNote: "C2",
      highestNote: "C4"
    },
    confidence: {
      level: "high",
      source: "model",
      notes: "Known review fixture"
    },
    rehearsalPriority: "high",
    simplification: "Keep the root.",
    setupNote: "Lock the entrance.",
    transpositionPlan: "Keep concert pitch.",
    manualOverrides: [],
    overlapWarnings: []
  };
}

function reviewSong(): RehearsalSong {
  return {
    id: "review-song",
    title: "Review Song",
    sections: [
      {
        id: "verse-1",
        label: "verse",
        groove: "Straight eighths",
        timeRange: { start: 0, end: 16 },
        confidence: {
          level: "high",
          source: "model",
          notes: "Known review fixture"
        },
        roles: [role("bass-guitar", "Bass Guitar"), role("lead-vocal", "Lead Vocal")],
        partGraph: []
      }
    ],
    exportSummary: {
      format: "cue-sheet",
      headline: "Lock the verse entrance.",
      focusSections: ["verse"]
    }
  };
}

describe("workspace navigation review regressions", () => {
  beforeEach(() => {
    mockLoadProject.mockReset();
  });

  it("associates disabled navigation with its recovery description", () => {
    render(<App />);

    const primaryNav = screen.getByRole("navigation", { name: /primary rehearsal views/i });
    const compactNav = screen.getByRole("navigation", { name: /compact rehearsal views/i });

    for (const button of [
      within(primaryNav).getByRole("button", { name: "Export" }),
      within(compactNav).getByRole("button", { name: "Export compact view" })
    ]) {
      const descriptionId = button.getAttribute("aria-describedby");
      expect(descriptionId).toBeTruthy();
      expect(document.getElementById(descriptionId!)).toHaveTextContent("Analyze a song or open a project first");
    }
  });

  it("treats every Transpose activation as a fresh request and returns to the first role", async () => {
    mockLoadProject.mockResolvedValueOnce(reviewSong());
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Lead Vocal" })).toBeTruthy();
    });

    const primaryNav = screen.getByRole("navigation", { name: /primary rehearsal views/i });
    const transposeButton = within(primaryNav).getByRole("button", { name: "Transpose" });

    fireEvent.click(transposeButton);
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Bass Guitar" })).toHaveAttribute("aria-selected", "true");
      expect(document.getElementById("workspace-surface-transpose")).toHaveFocus();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));
    expect(screen.getByRole("tab", { name: "Lead Vocal" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(transposeButton);
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Bass Guitar" })).toHaveAttribute("aria-selected", "true");
      expect(document.getElementById("workspace-surface-transpose")).toHaveFocus();
    });
  });

  it("clears the previous workspace surface when a different project is opened", async () => {
    mockLoadProject
      .mockResolvedValueOnce(reviewSong())
      .mockResolvedValueOnce({ ...reviewSong(), id: "replacement-song", title: "Replacement Song" });
    render(<App />);

    const openProjectButton = screen.getByRole("button", { name: /open project/i });
    fireEvent.click(openProjectButton);
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Lead Vocal" })).toBeTruthy();
    });

    const primaryNav = screen.getByRole("navigation", { name: /primary rehearsal views/i });
    const workspaceButton = within(primaryNav).getByRole("button", { name: "Workspace" });
    const transposeButton = within(primaryNav).getByRole("button", { name: "Transpose" });

    fireEvent.click(transposeButton);
    await waitFor(() => {
      expect(transposeButton).toHaveAttribute("aria-current", "page");
    });

    fireEvent.click(openProjectButton);
    await waitFor(() => {
      expect(workspaceButton).toHaveAttribute("aria-current", "page");
      expect(transposeButton).not.toHaveAttribute("aria-current");
    });
  });
});