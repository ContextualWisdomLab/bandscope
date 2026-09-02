import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
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
    loadProject: () => mockLoadProject(),
    subscribeToAnalysisJobUpdates: vi.fn(async () => () => undefined)
  };
});

describe("loaded-project rehearsal navigation identity", () => {
  beforeEach(() => {
    mockLoadProject.mockReset();
  });

  it("clears timeline and roadmap focus when a second saved analysis reuses analyzed-song", async () => {
    const firstProject = { ...createDemoRehearsalSong(), id: "analyzed-song", title: "First saved analysis" };
    const secondProject = { ...createDemoRehearsalSong(), id: "analyzed-song", title: "Second saved analysis" };
    mockLoadProject.mockResolvedValueOnce(firstProject).mockResolvedValueOnce(secondProject);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "First saved analysis" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Find verse at 0:10–0:30 on the timeline/i }));
    fireEvent.click(screen.getByRole("button", { name: /Find verse for Bass Guitar on the roadmap/i }));
    expect(screen.getByTestId("song-structure-section-verse-1")).toHaveAttribute("aria-current", "location");
    expect(screen.getByTestId("section-roadmap-role-verse-1-bass-guitar")).toHaveAttribute("aria-current", "location");

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Second saved analysis" })).toBeInTheDocument());

    expect(screen.getByTestId("song-structure-section-verse-1")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("section-roadmap-section-verse-1")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("section-roadmap-role-verse-1-bass-guitar")).not.toHaveAttribute("aria-current");
  });
});
