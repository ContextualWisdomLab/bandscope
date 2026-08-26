import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTurnaroundPlanCallout } from "./FirstTurnaroundPlanCallout";

const DEMO_TURNAROUND_PLAN =
  "Turn these last bars with Lead Vocal on the verse last beat; land the chorus downbeat together.";
const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithTurnaroundPlan() {
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
  appendedSongStructureTargets.add(timeline);
  return { grid: timeline, scrollIntoView };
}

describe("FirstTurnaroundPlanCallout", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstTurnaroundPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No turnaround plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithTurnaroundPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstTurnaroundPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar turnaround at 0:30" })).toBeTruthy();
  });

  it("contains a hostile song identity descriptor lookup instead of crashing the callout", () => {
    const song = new Proxy(songWithTurnaroundPlan(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile song id descriptor");
      }
    });

    expect(() => render(<FirstTurnaroundPlanCallout song={song} />)).not.toThrow();
    expect(
      screen.getByText("No turnaround plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same turnaround signature", () => {
    const firstSong = songWithTurnaroundPlan();
    const nextSong = songWithTurnaroundPlan();
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
    const { rerender } = render(<FirstTurnaroundPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar turnaround at 0:30" }));
    expect(
      screen.getByText(/Turn those last bars on Bass Guitar at 0:30 before the next section lands./)
    ).toBeTruthy();

    rerender(<FirstTurnaroundPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar has a shared turnaround in the verse at 0:30.")).toBeTruthy();
    expect(
      screen.queryByText(/Turn those last bars on Bass Guitar at 0:30 before the next section lands./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithTurnaroundPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstTurnaroundPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar turnaround at 0:30" }));
    expect(
      screen.getByText(/Turn those last bars on Bass Guitar at 0:30 before the next section lands./)
    ).toBeTruthy();

    rerender(<FirstTurnaroundPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Turn those last bars on Bass Guitar at 0:30 before the next section lands./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar has a shared turnaround in the verse at 0:30.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's turnaround plan under the named landing part", () => {
    const song = songWithTurnaroundPlan();
    song.sections[0]!.roles[0]!.turnaroundPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.turnaroundPlan = "Leave the vocal on the last lyric while the turnaround lands.";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.turnaroundPlan =
      "Turn these last bars with Lead Vocal; land the downbeat together.";

    render(<FirstTurnaroundPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand has a shared turnaround in the verse at 0:30.")
    ).toBeTruthy();
    expect(
      screen.getByText("Turn these last bars with Lead Vocal; land the downbeat together.")
    ).toBeTruthy();
    expect(screen.queryByText("Leave the vocal on the last lyric while the turnaround lands.")).toBeNull();
    expect(screen.queryByText(DEMO_TURNAROUND_PLAN)).toBeNull();
  });

  it("names the first turnaround plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstTurnaroundPlanCallout song={songWithTurnaroundPlan()} />);

    expect(screen.getByText(DEMO_TURNAROUND_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar turnaround at 0:30"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Turn those last bars on Bass Guitar at 0:30 before the next section lands./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstTurnaroundPlanCallout song={songWithTurnaroundPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar turnaround at 0:30" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Turn those last bars on Bass Guitar at 0:30 before the next section lands./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstTurnaroundPlanCallout song={songWithTurnaroundPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar turnaround at 0:30" }));

    expect(screen.getByText("Bass Guitar has a shared turnaround in the verse at 0:30.")).toBeTruthy();
    expect(
      screen.queryByText(/Turn those last bars on Bass Guitar at 0:30 before the next section lands./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithTurnaroundPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstTurnaroundPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar turnaround at 0:30" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("fails closed when one workspace owns more than one song-structure renderer", () => {
    const firstScroll = vi.fn();
    const secondScroll = vi.fn();
    const { container } = render(
      <div>
        <FirstTurnaroundPlanCallout song={songWithTurnaroundPlan()} />
        <div data-testid="song-structure-grid">
          <div data-section-index="0" />
        </div>
        <div data-testid="song-structure-grid">
          <div data-section-index="0" />
        </div>
      </div>
    );
    const targets = container.querySelectorAll<HTMLElement>('[data-section-index="0"]');
    Object.defineProperty(targets[0], "scrollIntoView", {
      configurable: true,
      value: firstScroll
    });
    Object.defineProperty(targets[1], "scrollIntoView", {
      configurable: true,
      value: secondScroll
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar turnaround at 0:30" }));

    expect(firstScroll).not.toHaveBeenCalled();
    expect(secondScroll).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar has a shared turnaround in the verse at 0:30.")).toBeTruthy();
  });

  it("fails closed when more than one song-structure renderer is mounted globally", () => {
    const first = appendSongStructureTarget();
    const second = appendSongStructureTarget();

    render(<FirstTurnaroundPlanCallout song={songWithTurnaroundPlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar turnaround at 0:30" }));

    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(second.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar has a shared turnaround in the verse at 0:30.")).toBeTruthy();

    first.grid.remove();
    second.grid.remove();
  });
});
