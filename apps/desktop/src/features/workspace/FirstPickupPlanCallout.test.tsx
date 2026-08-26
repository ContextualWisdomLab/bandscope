import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPickupPlanCallout } from "./FirstPickupPlanCallout";

const DEMO_PICKUP_PLAN = "Play this pickup with Lead Vocal; land the downbeat together.";
const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithPickupPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const intro = structuredClone(verse);
  intro.id = "intro-1";
  intro.label = "intro";
  intro.timeRange = { start: 0, end: verse.timeRange.start };
  intro.roles = intro.roles.map((role) => {
    const clone = { ...role };
    delete clone.pickupPlan;
    delete clone.pickupPlanSource;
    return clone;
  });
  intro.partGraph = intro.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id !== "bass-guitar"
  }));
  song.sections = [intro, verse];
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

describe("FirstPickupPlanCallout", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstPickupPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No pickup plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithPickupPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstPickupPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar pickup at 0:10" })).toBeTruthy();
  });

  it("contains a hostile song identity descriptor lookup instead of crashing the callout", () => {
    const song = new Proxy(songWithPickupPlan(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile song id descriptor");
      }
    });

    expect(() => render(<FirstPickupPlanCallout song={song} />)).not.toThrow();
    expect(
      screen.getByText("No pickup plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same pickup signature", () => {
    const firstSong = songWithPickupPlan();
    const nextSong = songWithPickupPlan();
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
    const { rerender } = render(<FirstPickupPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pickup at 0:10" }));
    expect(
      screen.getByText(/Play that pickup on Bass Guitar at 0:10 before the downbeat lands./)
    ).toBeTruthy();

    rerender(<FirstPickupPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar has a pickup into the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Play that pickup on Bass Guitar at 0:10 before the downbeat lands./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithPickupPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstPickupPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pickup at 0:10" }));
    expect(
      screen.getByText(/Play that pickup on Bass Guitar at 0:10 before the downbeat lands./)
    ).toBeTruthy();

    rerender(<FirstPickupPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Play that pickup on Bass Guitar at 0:10 before the downbeat lands./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar has a pickup into the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's pickup plan under the named landing part", () => {
    const song = songWithPickupPlan();
    song.sections[1]!.roles[0]!.pickupPlan = "Bass leftover pickup that must not appear.";
    song.sections[1]!.roles[0]!.rehearsalPriority = "low";
    song.sections[1]!.roles[2]!.pickupPlan = "Leave the vocal on the last lyric while the pickup lands.";
    song.sections[1]!.roles[2]!.rehearsalPriority = "low";
    song.sections[1]!.roles[1]!.pickupPlan =
      "Play this pickup with Lead Vocal; land the downbeat together.";
    song.sections[0]!.partGraph = song.sections[0]!.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id !== "keys-right"
    }));

    render(<FirstPickupPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand has a pickup into the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText("Play this pickup with Lead Vocal; land the downbeat together.")
    ).toBeTruthy();
    expect(screen.queryByText("Leave the vocal on the last lyric while the pickup lands.")).toBeNull();
    expect(screen.queryByText("Bass leftover pickup that must not appear.")).toBeNull();
  });

  it("names the first pickup plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPickupPlanCallout song={songWithPickupPlan()} />);

    expect(screen.getByText(DEMO_PICKUP_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar pickup at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Play that pickup on Bass Guitar at 0:10 before the downbeat lands./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstPickupPlanCallout song={songWithPickupPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pickup at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Play that pickup on Bass Guitar at 0:10 before the downbeat lands./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstPickupPlanCallout song={songWithPickupPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pickup at 0:10" }));

    expect(screen.getByText("Bass Guitar has a pickup into the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Play that pickup on Bass Guitar at 0:10 before the downbeat lands./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithPickupPlan();
    song.sections[1]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstPickupPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pickup at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("fails closed when one workspace owns more than one song-structure renderer", () => {
    const firstScroll = vi.fn();
    const secondScroll = vi.fn();
    const { container } = render(
      <div>
        <FirstPickupPlanCallout song={songWithPickupPlan()} />
        <div data-testid="song-structure-grid">
          <div data-section-index="1" />
        </div>
        <div data-testid="song-structure-grid">
          <div data-section-index="1" />
        </div>
      </div>
    );
    const targets = container.querySelectorAll<HTMLElement>('[data-section-index="1"]');
    Object.defineProperty(targets[0], "scrollIntoView", {
      configurable: true,
      value: firstScroll
    });
    Object.defineProperty(targets[1], "scrollIntoView", {
      configurable: true,
      value: secondScroll
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pickup at 0:10" }));

    expect(firstScroll).not.toHaveBeenCalled();
    expect(secondScroll).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar has a pickup into the verse at 0:10.")).toBeTruthy();
  });

  it("fails closed when more than one song-structure renderer is mounted globally", () => {
    const first = appendSongStructureTarget();
    const second = appendSongStructureTarget();

    render(<FirstPickupPlanCallout song={songWithPickupPlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar pickup at 0:10" }));

    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(second.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar has a pickup into the verse at 0:10.")).toBeTruthy();

    first.grid.remove();
    second.grid.remove();
  });
});
