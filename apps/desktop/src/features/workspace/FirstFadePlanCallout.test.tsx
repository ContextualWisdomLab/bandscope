import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstFadePlanCallout } from "./FirstFadePlanCallout";

const DEMO_FADE_PLAN = "Fade this part; let the next downbeat land quieter.";
const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithFadePlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({ ...node, is_active: true }));
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = chorus.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
  vocal.fadePlan = DEMO_FADE_PLAN;
  vocal.fadePlanSource = "model";
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

describe("FirstFadePlanCallout", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstFadePlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No fade plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithFadePlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstFadePlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Lead Vocal fade at 0:30" })).toBeTruthy();
  });

  it("contains a hostile song identity descriptor lookup instead of crashing the callout", () => {
    const song = new Proxy(songWithFadePlan(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile song id descriptor");
      }
    });

    expect(() => render(<FirstFadePlanCallout song={song} />)).not.toThrow();
    expect(
      screen.getByText("No fade plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same fade signature", () => {
    const firstSong = songWithFadePlan();
    const nextSong = songWithFadePlan();
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
    const { rerender } = render(<FirstFadePlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fade at 0:30" }));
    expect(screen.getByText(/Fade Lead Vocal together at 0:30 so the quieter landing is audible./)).toBeTruthy();

    rerender(<FirstFadePlanCallout song={nextSong} />);

    expect(screen.getByText("Lead Vocal fades the chorus at 0:30.")).toBeTruthy();
    expect(screen.queryByText(/Fade Lead Vocal together at 0:30 so the quieter landing is audible./)).toBeNull();
  });

  it("resets armed guidance when the landing role name changes in the same workspace", () => {
    const firstSong = songWithFadePlan();
    const nextSong = structuredClone(firstSong);
    nextSong.sections[1]!.roles.find((role) => role.id === "lead-vocal")!.name = "Lead Singer";
    const workspaceInstanceKey = {};
    appendSongStructureTarget();
    const { rerender } = render(
      <FirstFadePlanCallout song={firstSong} workspaceInstanceKey={workspaceInstanceKey} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fade at 0:30" }));
    expect(screen.getByText(/Fade Lead Vocal together at 0:30 so the quieter landing is audible./)).toBeTruthy();

    rerender(<FirstFadePlanCallout song={nextSong} workspaceInstanceKey={workspaceInstanceKey} />);

    expect(screen.getByText("Lead Singer fades the chorus at 0:30.")).toBeTruthy();
    expect(screen.queryByText(/Fade Lead Singer together at 0:30 so the quieter landing is audible./)).toBeNull();
  });

  it("resets armed guidance when the section label changes in the same workspace", () => {
    const firstSong = songWithFadePlan();
    const nextSong = structuredClone(firstSong);
    nextSong.sections[1]!.label = "bridge";
    const workspaceInstanceKey = {};
    appendSongStructureTarget();
    const { rerender } = render(
      <FirstFadePlanCallout song={firstSong} workspaceInstanceKey={workspaceInstanceKey} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fade at 0:30" }));
    expect(screen.getByText(/Fade Lead Vocal together at 0:30 so the quieter landing is audible./)).toBeTruthy();

    rerender(<FirstFadePlanCallout song={nextSong} workspaceInstanceKey={workspaceInstanceKey} />);

    expect(screen.getByText("Lead Vocal fades the bridge at 0:30.")).toBeTruthy();
    expect(screen.queryByText(/Fade Lead Vocal together at 0:30 so the quieter landing is audible./)).toBeNull();
  });

  it("opens the named fade on the rendered map", () => {
    const { scrollIntoView } = appendSongStructureTarget();
    render(<FirstFadePlanCallout song={songWithFadePlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fade at 0:30" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Fade Lead Vocal together at 0:30 so the quieter landing is audible./)).toBeTruthy();
    expect(screen.getByText(DEMO_FADE_PLAN)).toBeTruthy();
  });
});
