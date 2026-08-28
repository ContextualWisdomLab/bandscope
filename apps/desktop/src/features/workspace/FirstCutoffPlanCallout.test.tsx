import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstCutoffPlanCallout } from "./FirstCutoffPlanCallout";

const DEMO_CUTOFF_PLAN =
  "Cut this off with Lead Vocal on the verse last beat; don't linger past the pickup.";
const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithCutoffPlan() {
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

describe("FirstCutoffPlanCallout", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstCutoffPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No cutoff plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithCutoffPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstCutoffPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" })).toBeTruthy();
  });

  it("contains a hostile song identity descriptor lookup instead of crashing the callout", () => {
    const song = new Proxy(songWithCutoffPlan(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile song id descriptor");
      }
    });

    expect(() => render(<FirstCutoffPlanCallout song={song} />)).not.toThrow();
    expect(
      screen.getByText("No cutoff plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same cutoff signature", () => {
    const firstSong = songWithCutoffPlan();
    const nextSong = songWithCutoffPlan();
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
    const { rerender } = render(<FirstCutoffPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" }));
    expect(
      screen.getByText(/Cut that off on Bass Guitar at 0:30 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstCutoffPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar has a shared cutoff in the verse at 0:30.")).toBeTruthy();
    expect(
      screen.queryByText(/Cut that off on Bass Guitar at 0:30 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithCutoffPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstCutoffPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" }));
    expect(
      screen.getByText(/Cut that off on Bass Guitar at 0:30 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstCutoffPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Cut that off on Bass Guitar at 0:30 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar has a shared cutoff in the verse at 0:30.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's cutoff plan under the named landing part", () => {
    const song = songWithCutoffPlan();
    song.sections[0]!.roles[0]!.cutoffPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.cutoffPlan = "Leave the vocal on the last lyric while the cutoff lands.";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.cutoffPlan =
      "Cut this off with Lead Vocal; don't linger past the last beat.";

    render(<FirstCutoffPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand has a shared cutoff in the verse at 0:30.")
    ).toBeTruthy();
    expect(
      screen.getByText("Cut this off with Lead Vocal; don't linger past the last beat.")
    ).toBeTruthy();
    expect(screen.queryByText("Leave the vocal on the last lyric while the cutoff lands.")).toBeNull();
    expect(screen.queryByText(DEMO_CUTOFF_PLAN)).toBeNull();
  });

  it("preserves malformed model guidance instead of localizing an empty target", () => {
    const song = songWithCutoffPlan();
    const role = song.sections[0]!.roles[0]!;
    role.cutoffPlan = "Cut this off with ; don't linger past the last beat.";
    role.cutoffPlanSource = "model";

    render(<FirstCutoffPlanCallout song={song} />);

    expect(
      screen.getByText("Cut this off with ; don't linger past the last beat.")
    ).toBeTruthy();
  });

  it("arms model-provenance guidance after successful map navigation", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const song = songWithCutoffPlan();
    const role = song.sections[0]!.roles[0]!;
    role.cutoffPlan = "Cut this off with Lead Vocal; don't linger past the last beat.";
    role.cutoffPlanSource = "model";

    render(<FirstCutoffPlanCallout song={song} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Cut that off on Bass Guitar at 0:30 before the room starts./)
    ).toBeTruthy();
    grid.remove();
  });

  it("names the first cutoff plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstCutoffPlanCallout song={songWithCutoffPlan()} />);

    expect(screen.getByText(DEMO_CUTOFF_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar cutoff at 0:30"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Cut that off on Bass Guitar at 0:30 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstCutoffPlanCallout song={songWithCutoffPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Cut that off on Bass Guitar at 0:30 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstCutoffPlanCallout song={songWithCutoffPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" }));

    expect(screen.getByText("Bass Guitar has a shared cutoff in the verse at 0:30.")).toBeTruthy();
    expect(
      screen.queryByText(/Cut that off on Bass Guitar at 0:30 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithCutoffPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstCutoffPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("fails closed when one workspace owns more than one song-structure renderer", () => {
    const firstScroll = vi.fn();
    const secondScroll = vi.fn();
    const { container } = render(
      <div>
        <FirstCutoffPlanCallout song={songWithCutoffPlan()} />
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

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" }));

    expect(firstScroll).not.toHaveBeenCalled();
    expect(secondScroll).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar has a shared cutoff in the verse at 0:30.")).toBeTruthy();
  });

  it("fails closed when more than one song-structure renderer is mounted globally", () => {
    const first = appendSongStructureTarget();
    const second = appendSongStructureTarget();

    render(<FirstCutoffPlanCallout song={songWithCutoffPlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar cutoff at 0:30" }));

    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(second.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar has a shared cutoff in the verse at 0:30.")).toBeTruthy();

    first.grid.remove();
    second.grid.remove();
  });
});
