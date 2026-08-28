import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHookPlanCallout } from "./FirstHookPlanCallout";

const DEMO_HOOK_PLAN =
  "Lead vocal carries the chorus hook; lock the melody before anyone stacks harmony.";

function songWithHookPlan() {
  return createDemoRehearsalSong();
}

function appendSongStructureTarget(ariaLabel = "Scrollable song structure timeline") {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", ariaLabel);
  const grid = document.createElement("div");
  grid.id = "workspace-song-structure-grid";
  const target = document.createElement("div");
  target.dataset.sectionIndex = "0";
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(target);
  timeline.appendChild(grid);
  document.body.appendChild(timeline);
  return { grid: timeline, scrollIntoView };
}

describe("FirstHookPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstHookPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No hook plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithHookPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstHookPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Lead Vocal hook at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same hook signature", () => {
    const firstSong = songWithHookPlan();
    const nextSong = songWithHookPlan();
    for (const song of [firstSong, nextSong]) {
      Object.defineProperty(song, "id", {
        configurable: true,
        enumerable: true,
        get() {
          throw new Error("hostile song id getter");
        }
      });
    }
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstHookPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal hook at 0:10" }));
    expect(
      screen.getByText(/Lock that hook on Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstHookPlanCallout song={nextSong} />);

    expect(screen.getByText("Lead Vocal still has a hook plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that hook on Lead Vocal at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithHookPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstHookPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal hook at 0:10" }));
    expect(
      screen.getByText(/Lock that hook on Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstHookPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that hook on Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Lead Vocal still has a hook plan in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's hook plan under the named holding part", () => {
    const song = songWithHookPlan();
    song.sections[0]!.roles[0]!.hookPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.hookPlan = "Leave the bass on roots while the hook lands.";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.hookPlan =
      "Keep the right-hand figure under the vocal so the hook still reads.";

    render(<FirstHookPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a hook plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText("Keep the right-hand figure under the vocal so the hook still reads.")
    ).toBeTruthy();
    expect(screen.queryByText("Leave the bass on roots while the hook lands.")).toBeNull();
    expect(screen.queryByText(DEMO_HOOK_PLAN)).toBeNull();
  });

  it("names the first hook plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstHookPlanCallout song={songWithHookPlan()} />);

    expect(screen.getByText(DEMO_HOOK_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Lead Vocal hook at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that hook on Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstHookPlanCallout song={songWithHookPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal hook at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that hook on Lead Vocal at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstHookPlanCallout song={songWithHookPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal hook at 0:10" }));

    expect(screen.getByText("Lead Vocal still has a hook plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that hook on Lead Vocal at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithHookPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstHookPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal hook at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("fails closed when more than one song-structure renderer is mounted globally", () => {
    const first = appendSongStructureTarget();
    const second = appendSongStructureTarget();

    render(<FirstHookPlanCallout song={songWithHookPlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal hook at 0:10" }));

    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(second.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText("Lead Vocal still has a hook plan in the verse at 0:10.")).toBeTruthy();

    first.grid.remove();
    second.grid.remove();
  });
});
