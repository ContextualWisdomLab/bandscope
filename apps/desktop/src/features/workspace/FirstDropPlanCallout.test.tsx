import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstDropPlanCallout } from "./FirstDropPlanCallout";

const DEMO_DROP_PLAN = "Hit this drop; come in together when the texture fills.";
const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithDropPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === "bass-guitar" || node.role_id === "keys-right"
  }));
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = chorus.partGraph.map((node) => ({
    ...node,
    is_active: true
  }));
  const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
  vocal.dropPlan = DEMO_DROP_PLAN;
  vocal.dropPlanSource = "model";
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

describe("FirstDropPlanCallout", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstDropPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No drop plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithDropPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstDropPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Lead Vocal drop at 0:30" })).toBeTruthy();
  });

  it("contains a hostile song identity descriptor lookup instead of crashing the callout", () => {
    const song = new Proxy(songWithDropPlan(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile song id descriptor");
      }
    });

    expect(() => render(<FirstDropPlanCallout song={song} />)).not.toThrow();
    expect(
      screen.getByText("No drop plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same drop signature", () => {
    const firstSong = songWithDropPlan();
    const nextSong = songWithDropPlan();
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
    const { rerender } = render(<FirstDropPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal drop at 0:30" }));
    expect(screen.getByText(/Land Lead Vocal together at 0:30 when the texture fills./)).toBeTruthy();

    rerender(<FirstDropPlanCallout song={nextSong} />);

    expect(screen.getByText("Lead Vocal lands the chorus drop at 0:30.")).toBeTruthy();
    expect(screen.queryByText(/Land Lead Vocal together at 0:30 when the texture fills./)).toBeNull();
  });

  it("opens the named drop on the rendered map", () => {
    const { scrollIntoView } = appendSongStructureTarget();
    render(<FirstDropPlanCallout song={songWithDropPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal drop at 0:30" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Land Lead Vocal together at 0:30 when the texture fills./)).toBeTruthy();
    expect(screen.getByText(DEMO_DROP_PLAN)).toBeTruthy();
  });
});
