import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type ProjectBootstrapSummary } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";
import { firstRangeRoadmap, firstRangeSqueeze } from "./firstRangeSqueeze";

const originalLanguage = navigator.language;
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

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", { configurable: true, value: language });
}

function projectBootstrap(projectId: string): ProjectBootstrapSummary {
  return {
    projectId,
    sourceMode: "reference",
    projectRoot: `/tmp/bandscope/projects/${projectId}`,
    cacheRoot: `/tmp/bandscope/projects/${projectId}/cache`,
    tempRoot: `/tmp/bandscope/projects/${projectId}/tmp`,
    source: { sourcePath: `/tmp/bandscope/projects/${projectId}/source.wav`, fileName: "source.wav", extension: "wav", fileSizeBytes: 1024 }
  };
}

describe("first-range roadmap interaction regressions", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: originalScrollIntoView });
    } else {
      delete (HTMLElement.prototype as { scrollIntoView?: typeof HTMLElement.prototype.scrollIntoView }).scrollIntoView;
    }
    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
    vi.restoreAllMocks();
  });

  it("requests roadmap focus again when Find is activated twice for the same part", () => {
    const scrollRequests = installScrollRecorder();
    const rehearsalSong = createDemoRehearsalSong();
    render(<Workspace song={rehearsalSong} />);
    const findRoadmapButton = screen.getByRole("button", { name: "Find verse for Bass Guitar on the roadmap" });
    fireEvent.click(findRoadmapButton);
    fireEvent.click(findRoadmapButton);
    expect(scrollRequests).toHaveBeenCalledTimes(2);
  });

  it("scrolls the exact requested role rather than only its section wrapper", () => {
    const rehearsalSong = createDemoRehearsalSong();
    render(<Workspace song={rehearsalSong} />);
    const sectionCard = screen.getByTestId("section-roadmap-section-verse-1");
    const roleCard = screen.getByTestId("section-roadmap-role-verse-1-bass-guitar");
    const sectionScroll = vi.fn();
    const roleScroll = vi.fn();
    Object.defineProperty(sectionCard, "scrollIntoView", { configurable: true, value: sectionScroll });
    Object.defineProperty(roleCard, "scrollIntoView", { configurable: true, value: roleScroll });

    fireEvent.click(screen.getByRole("button", { name: "Find verse for Bass Guitar on the roadmap" }));

    expect(roleScroll).toHaveBeenCalledTimes(1);
    expect(sectionScroll).not.toHaveBeenCalled();
  });

  it("does not carry a focused roadmap cell into a replacement rehearsal song", () => {
    installScrollRecorder();
    const rehearsalSong = createDemoRehearsalSong();
    const replacementSong = { ...createDemoRehearsalSong(), id: "replacement-song" };
    const renderedWorkspace = render(<Workspace song={rehearsalSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Find verse for Bass Guitar on the roadmap" }));
    expect(screen.getByTestId("section-roadmap-section-verse-1")).toHaveAttribute("aria-current", "location");
    renderedWorkspace.rerender(<Workspace song={replacementSong} />);
    expect(screen.getByTestId("section-roadmap-section-verse-1")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("section-roadmap-role-verse-1-bass-guitar")).not.toHaveAttribute("aria-current");
  });

  it("does not carry roadmap focus across projects that reuse analyzed-song", () => {
    installScrollRecorder();
    const analyzedSong = { ...createDemoRehearsalSong(), id: "analyzed-song" };
    const replacementAnalysis = { ...createDemoRehearsalSong(), id: "analyzed-song" };
    const renderedWorkspace = render(<Workspace song={analyzedSong} sourceBootstrap={projectBootstrap("project-one")} />);
    fireEvent.click(screen.getByRole("button", { name: "Find verse for Bass Guitar on the roadmap" }));
    expect(screen.getByTestId("section-roadmap-section-verse-1")).toHaveAttribute("aria-current", "location");
    renderedWorkspace.rerender(<Workspace song={replacementAnalysis} sourceBootstrap={projectBootstrap("project-two")} />);
    expect(screen.getByTestId("section-roadmap-section-verse-1")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("section-roadmap-role-verse-1-bass-guitar")).not.toHaveAttribute("aria-current");
  });

  it("keeps repeated labels and display names navigable when IDs remain unique", () => {
    const rehearsalSong = createDemoRehearsalSong();
    rehearsalSong.sections.push({ ...rehearsalSong.sections[0]!, id: "verse-2" });
    rehearsalSong.sections[0]!.roles.push({ ...rehearsalSong.sections[0]!.roles[0]!, id: "bass-guitar-double" });
    expect(firstRangeRoadmap(rehearsalSong, firstRangeSqueeze(rehearsalSong))).toEqual({ sectionId: "verse-1", roleId: "bass-guitar", sectionLabel: "verse", roleName: "Bass Guitar" });
    render(<Workspace song={rehearsalSong} />);
    expect(screen.getByRole("button", { name: "Find verse for Bass Guitar on the roadmap" })).toBeInTheDocument();
  });

  it("fails closed when the target section identifier is duplicated elsewhere", () => {
    const rehearsalSong = createDemoRehearsalSong();
    rehearsalSong.sections.push({ ...rehearsalSong.sections[0]!, id: rehearsalSong.sections[0]!.id, label: "chorus" });
    expect(firstRangeRoadmap(rehearsalSong, firstRangeSqueeze(rehearsalSong))).toBeNull();
    render(<Workspace song={rehearsalSong} />);
    expect(screen.queryByRole("button", { name: /Find .+ on the roadmap/ })).toBeNull();
  });

  it("fails closed when the target role identifier is duplicated on the section", () => {
    const rehearsalSong = createDemoRehearsalSong();
    rehearsalSong.sections[0]!.roles.push({ ...rehearsalSong.sections[0]!.roles[0]!, name: "Bass Guitar Double" });
    expect(firstRangeRoadmap(rehearsalSong, firstRangeSqueeze(rehearsalSong))).toBeNull();
    render(<Workspace song={rehearsalSong} />);
    expect(screen.queryByRole("button", { name: /Find .+ on the roadmap/ })).toBeNull();
  });

  it("hides the roadmap control when no role has a named playable range", () => {
    const rehearsalSong = createDemoRehearsalSong();
    rehearsalSong.sections = rehearsalSong.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) => ({
        ...role,
        range: { lowestNote: "", highestNote: "none" },
        overlapWarnings: []
      }))
    }));

    render(<Workspace song={rehearsalSong} />);

    expect(screen.queryByRole("button", { name: /Find .+ on the roadmap/ })).toBeNull();
  });

  it("localizes the roadmap find control in Korean", () => {
    setNavigatorLanguage("ko-KR");
    const rehearsalSong = createDemoRehearsalSong();

    render(<Workspace song={rehearsalSong} />);

    expect(screen.getByRole("button", { name: "로드맵에서 Bass Guitar verse 찾기" })).toBeInTheDocument();
  });

  it("avoids smooth scrolling when reduced motion is preferred", () => {
    const scrollRequests = installScrollRecorder();
    setReducedMotionPreference(true);
    const rehearsalSong = createDemoRehearsalSong();
    render(<Workspace song={rehearsalSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Find verse for Bass Guitar on the roadmap" }));
    expect(scrollRequests).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });
});