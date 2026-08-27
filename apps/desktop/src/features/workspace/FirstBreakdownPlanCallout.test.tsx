import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstBreakdownPlanCallout } from "./FirstBreakdownPlanCallout";

const DEMO_BREAKDOWN_PLAN = "Hold this breakdown; keep it sparse until the drop.";
const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithBreakdownPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  const bass = chorus.roles.find((role) => role.id === "bass-guitar")!;
  bass.breakdownPlan = DEMO_BREAKDOWN_PLAN;
  bass.breakdownPlanSource = "model";
  chorus.partGraph = chorus.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === "bass-guitar"
  }));
  song.sections = [verse, chorus];
  return song;
}

function appendSongStructureTarget(ariaLabel = "Scrollable song structure timeline") {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", ariaLabel);
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const target = document.createElement("div");
  target.dataset.sectionIndex = "1";
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(target);
  timeline.appendChild(grid);
  document.body.appendChild(timeline);
  appendedSongStructureTargets.add(timeline);
  return { grid: timeline, scrollIntoView };
}

describe("FirstBreakdownPlanCallout", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstBreakdownPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "No breakdown plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithBreakdownPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstBreakdownPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar breakdown at 0:30" })).toBeTruthy();
  });

  it("contains a hostile song identity descriptor lookup instead of crashing the callout", () => {
    const song = new Proxy(songWithBreakdownPlan(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile song id descriptor");
      }
    });

    expect(() => render(<FirstBreakdownPlanCallout song={song} />)).not.toThrow();
    expect(
      screen.getByText(
        "No breakdown plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same breakdown signature", () => {
    const firstSong = songWithBreakdownPlan();
    const nextSong = songWithBreakdownPlan();
    for (const song of [firstSong, nextSong]) {
      Object.defineProperty(song, "id", {
        configurable: true,
        enumerable: true,
        get() {
          throw new Error("hostile song id getter");
        }
      });
    }
    appendSongStructureTarget();
    const { rerender } = render(<FirstBreakdownPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar breakdown at 0:30" }));
    expect(screen.getByText(/Keep Bass Guitar sparse at 0:30 until the drop./)).toBeTruthy();

    rerender(<FirstBreakdownPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar holds the chorus breakdown at 0:30.")).toBeTruthy();
    expect(screen.queryByText(/Keep Bass Guitar sparse at 0:30 until the drop./)).toBeNull();
  });

  it("opens the named breakdown on the rendered map", () => {
    const { scrollIntoView } = appendSongStructureTarget();
    render(<FirstBreakdownPlanCallout song={songWithBreakdownPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar breakdown at 0:30" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Keep Bass Guitar sparse at 0:30 until the drop./)).toBeTruthy();
    expect(screen.getByText(DEMO_BREAKDOWN_PLAN)).toBeTruthy();
  });
});
