import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";
import { firstRangeRoadmap, firstRangeSqueeze } from "./firstRangeSqueeze";

const originalMatchMedia = window.matchMedia;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

/** Record scrollIntoView so repeated Find activations can be counted. */
function installScrollRecorder() {
  const scrollRequests = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollRequests
  });
  return scrollRequests;
}

/** Stub matchMedia for the reduced-motion preference used by roadmap scrolling. */
function setReducedMotionPreference(reducedMotionPreferred: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: reducedMotionPreferred })
  });
}

describe("first-range roadmap interaction regressions", () => {
  afterEach(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView
      });
    } else {
      delete (HTMLElement.prototype as { scrollIntoView?: typeof HTMLElement.prototype.scrollIntoView }).scrollIntoView;
    }

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia
    });
    vi.restoreAllMocks();
  });

  it("requests roadmap focus again when Find is activated twice for the same part", () => {
    const scrollRequests = installScrollRecorder();
    const rehearsalSong = createDemoRehearsalSong();

    render(<Workspace song={rehearsalSong} />);
    const findRoadmapButton = screen.getByRole("button", {
      name: "Find verse for Bass Guitar on the roadmap"
    });

    fireEvent.click(findRoadmapButton);
    fireEvent.click(findRoadmapButton);

    expect(scrollRequests).toHaveBeenCalledTimes(2);
  });

  it("does not carry a focused roadmap cell into a replacement rehearsal song", () => {
    installScrollRecorder();
    const rehearsalSong = createDemoRehearsalSong();
    const replacementSong = {
      ...createDemoRehearsalSong(),
      id: "replacement-song"
    };

    const renderedWorkspace = render(<Workspace song={rehearsalSong} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Find verse for Bass Guitar on the roadmap"
      })
    );
    expect(screen.getByTestId("section-roadmap-section-verse-1")).toHaveAttribute(
      "aria-current",
      "location"
    );

    renderedWorkspace.rerender(<Workspace song={replacementSong} />);

    expect(screen.getByTestId("section-roadmap-section-verse-1")).not.toHaveAttribute(
      "aria-current"
    );
    expect(screen.getByTestId("section-roadmap-role-verse-1-bass-guitar")).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("fails closed when the target section identifier is duplicated elsewhere", () => {
    const rehearsalSong = createDemoRehearsalSong();
    rehearsalSong.sections.push({
      ...rehearsalSong.sections[0]!,
      id: rehearsalSong.sections[0]!.id,
      label: "chorus"
    });

    expect(firstRangeRoadmap(rehearsalSong, firstRangeSqueeze(rehearsalSong))).toBeNull();

    render(<Workspace song={rehearsalSong} />);
    expect(
      screen.queryByRole("button", { name: /Find .+ on the roadmap/ })
    ).toBeNull();
    expect(
      screen.queryAllByTestId("section-roadmap-section-verse-1").filter(
        (sectionCard) => sectionCard.getAttribute("aria-current") === "location"
      )
    ).toHaveLength(0);
  });

  it("keeps the buyer-visible control when display names repeat but IDs remain unique", () => {
    const rehearsalSong = createDemoRehearsalSong();
    rehearsalSong.sections[0]!.roles.push({
      ...rehearsalSong.sections[0]!.roles[0]!,
      id: "bass-guitar-double"
    });

    expect(firstRangeRoadmap(rehearsalSong, firstRangeSqueeze(rehearsalSong))).toEqual({
      sectionId: "verse-1",
      roleId: "bass-guitar",
      sectionLabel: "verse",
      roleName: "Bass Guitar"
    });

    render(<Workspace song={rehearsalSong} />);
    expect(screen.getByRole("button", { name: "Find verse for Bass Guitar on the roadmap" })).toBeInTheDocument();
  });

  it("fails closed when the target role identifier is duplicated on the section", () => {
    const rehearsalSong = createDemoRehearsalSong();
    rehearsalSong.sections[0]!.roles.push({
      ...rehearsalSong.sections[0]!.roles[0]!,
      name: "Bass Guitar Double"
    });

    expect(firstRangeRoadmap(rehearsalSong, firstRangeSqueeze(rehearsalSong))).toBeNull();

    render(<Workspace song={rehearsalSong} />);
    expect(screen.queryByRole("button", { name: /Find .+ on the roadmap/ })).toBeNull();
  });

  it("avoids smooth scrolling when reduced motion is preferred", () => {
    const scrollRequests = installScrollRecorder();
    setReducedMotionPreference(true);
    const rehearsalSong = createDemoRehearsalSong();

    render(<Workspace song={rehearsalSong} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Find verse for Bass Guitar on the roadmap"
      })
    );

    expect(scrollRequests).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto" })
    );
  });
});