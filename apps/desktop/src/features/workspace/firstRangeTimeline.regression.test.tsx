import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type ProjectBootstrapSummary } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";
import { firstRangeSqueeze, firstRangeTimeline } from "./firstRangeSqueeze";

const originalMatchMedia = window.matchMedia;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function installScrollRecorder() {
  const scrollRequests = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollRequests });
  return scrollRequests;
}

function setReducedMotionPreference(reducedMotionPreferred: boolean) {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: reducedMotionPreferred }) });
}

function projectBootstrap(projectId: string): ProjectBootstrapSummary {
  return {
    projectId,
    sourceMode: "reference",
    projectRoot: `/tmp/bandscope/projects/${projectId}`,
    cacheRoot: `/tmp/bandscope/projects/${projectId}/cache`,
    tempRoot: `/tmp/bandscope/projects/${projectId}/tmp`,
    source: {
      sourcePath: `/tmp/bandscope/projects/${projectId}/source.wav`,
      fileName: "source.wav",
      extension: "wav",
      fileSizeBytes: 1024
    }
  };
}

describe("first-range timeline interaction regressions", () => {
  afterEach(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: originalScrollIntoView });
    } else {
      delete (HTMLElement.prototype as { scrollIntoView?: typeof HTMLElement.prototype.scrollIntoView }).scrollIntoView;
    }
    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
    vi.restoreAllMocks();
  });

  it("requests timeline focus again when Find is activated twice for the same section", () => {
    const scrollRequests = installScrollRecorder();
    const rehearsalSong = createDemoRehearsalSong();
    render(<Workspace song={rehearsalSong} />);
    const findSectionButton = screen.getByRole("button", { name: "Find verse at 0:10–0:30 on the timeline" });
    fireEvent.click(findSectionButton);
    fireEvent.click(findSectionButton);
    expect(scrollRequests).toHaveBeenCalledTimes(2);
  });

  it("does not carry a focused section into a replacement rehearsal song", () => {
    installScrollRecorder();
    const rehearsalSong = createDemoRehearsalSong();
    const replacementSong = { ...createDemoRehearsalSong(), id: "replacement-song" };
    const renderedWorkspace = render(<Workspace song={rehearsalSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Find verse at 0:10–0:30 on the timeline" }));
    expect(screen.getByTestId("song-structure-section-verse-1")).toHaveAttribute("aria-current", "location");
    renderedWorkspace.rerender(<Workspace song={replacementSong} />);
    expect(screen.getByTestId("song-structure-section-verse-1")).not.toHaveAttribute("aria-current");
  });

  it("does not carry timeline focus across projects that reuse analyzed-song", () => {
    installScrollRecorder();
    const analyzedSong = { ...createDemoRehearsalSong(), id: "analyzed-song" };
    const replacementAnalysis = { ...createDemoRehearsalSong(), id: "analyzed-song" };
    const renderedWorkspace = render(<Workspace song={analyzedSong} sourceBootstrap={projectBootstrap("project-one")} />);
    fireEvent.click(screen.getByRole("button", { name: "Find verse at 0:10–0:30 on the timeline" }));
    expect(screen.getByTestId("song-structure-section-verse-1")).toHaveAttribute("aria-current", "location");
    renderedWorkspace.rerender(<Workspace song={replacementAnalysis} sourceBootstrap={projectBootstrap("project-two")} />);
    expect(screen.getByTestId("song-structure-section-verse-1")).not.toHaveAttribute("aria-current");
  });

  it("keeps repeated form labels navigable when IDs remain unique", () => {
    const rehearsalSong = createDemoRehearsalSong();
    rehearsalSong.sections.push({ ...rehearsalSong.sections[0]!, id: "verse-2", timeRange: { start: 90, end: 110 } });
    expect(firstRangeTimeline(rehearsalSong, firstRangeSqueeze(rehearsalSong))).toEqual({ sectionId: "verse-1", sectionLabel: "verse", startClock: "0:10", endClock: "0:30" });
    render(<Workspace song={rehearsalSong} />);
    expect(screen.getByRole("button", { name: "Find verse at 0:10–0:30 on the timeline" })).toBeInTheDocument();
  });

  it("fails closed when the target section identifier is duplicated elsewhere", () => {
    const rehearsalSong = createDemoRehearsalSong();
    rehearsalSong.sections[1] = { ...rehearsalSong.sections[1]!, id: rehearsalSong.sections[0]!.id, label: "chorus" };
    expect(firstRangeTimeline(rehearsalSong, firstRangeSqueeze(rehearsalSong))).toBeNull();
    render(<Workspace song={rehearsalSong} />);
    expect(screen.queryByRole("button", { name: /Find .+ on the timeline/ })).toBeNull();
    expect(screen.getByTestId("song-structure-grid").querySelectorAll("[aria-current='location']")).toHaveLength(0);
  });

  it("avoids smooth scrolling when reduced motion is preferred", () => {
    const scrollRequests = installScrollRecorder();
    setReducedMotionPreference(true);
    const rehearsalSong = createDemoRehearsalSong();
    render(<Workspace song={rehearsalSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Find verse at 0:10–0:30 on the timeline" }));
    expect(scrollRequests).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });
});