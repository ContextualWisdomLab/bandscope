import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPadPlanCallout } from "./FirstPadPlanCallout";

const DEMO_PAD_PLAN =
  "Drop to a two-bar pad so the Keyboard 1 Right Hand run can land.";

function songWithPadPlan() {
  return createDemoRehearsalSong();
}

function appendSongStructureTarget(ariaLabel = "Scrollable song structure timeline") {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", ariaLabel);
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
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

describe("FirstPadPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstPadPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No pad plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithPadPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstPadPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar pad at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same pad signature", () => {
    const firstSong = songWithPadPlan();
    const nextSong = songWithPadPlan();
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
    const { rerender } = render(<FirstPadPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pad at 0:10" }));
    expect(
      screen.getByText(/Lock that pad on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstPadPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still has a pad plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that pad on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithPadPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstPadPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pad at 0:10" }));
    expect(
      screen.getByText(/Lock that pad on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstPadPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that pad on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still has a pad plan in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's pad plan under the named holding part", () => {
    const song = songWithPadPlan();
    song.sections[0]!.roles[0]!.padPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.padPlan = "Leave the vocal on the last lyric while the pad holds.";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.padPlan =
      "Keep the right-hand figure under the vocal so the pad still reads.";

    render(<FirstPadPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a pad plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText("Keep the right-hand figure under the vocal so the pad still reads.")
    ).toBeTruthy();
    expect(screen.queryByText("Leave the vocal on the last lyric while the pad holds.")).toBeNull();
    expect(screen.queryByText(DEMO_PAD_PLAN)).toBeNull();
  });

  it("names the first pad plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPadPlanCallout song={songWithPadPlan()} />);

    expect(screen.getByText(DEMO_PAD_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar pad at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that pad on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstPadPlanCallout song={songWithPadPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pad at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that pad on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstPadPlanCallout song={songWithPadPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pad at 0:10" }));

    expect(screen.getByText("Bass Guitar still has a pad plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that pad on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithPadPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPadPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pad at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("fails closed when more than one song-structure renderer is mounted globally", () => {
    const first = appendSongStructureTarget();
    const second = appendSongStructureTarget();

    render(<FirstPadPlanCallout song={songWithPadPlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pad at 0:10" }));

    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(second.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar still has a pad plan in the verse at 0:10.")).toBeTruthy();

    first.grid.remove();
    second.grid.remove();
  });
});
