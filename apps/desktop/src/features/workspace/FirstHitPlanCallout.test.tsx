import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHitPlanCallout } from "./FirstHitPlanCallout";

const DEMO_HIT_PLAN =
  "Land this hit with Lead Vocal on the verse downbeat; don't drift past the pickup.";
const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithHitPlan() {
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

describe("FirstHitPlanCallout", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstHitPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No hit plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithHitPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstHitPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar hit at 0:10" })).toBeTruthy();
  });

  it("contains a hostile song identity descriptor lookup instead of crashing the callout", () => {
    const song = new Proxy(songWithHitPlan(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile song id descriptor");
      }
    });

    expect(() => render(<FirstHitPlanCallout song={song} />)).not.toThrow();
    expect(
      screen.getByText("No hit plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same hit signature", () => {
    const firstSong = songWithHitPlan();
    const nextSong = songWithHitPlan();
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
    const { rerender } = render(<FirstHitPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar hit at 0:10" }));
    expect(
      screen.getByText(/Land that hit on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstHitPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar has a shared hit in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Land that hit on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithHitPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstHitPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar hit at 0:10" }));
    expect(
      screen.getByText(/Land that hit on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstHitPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Land that hit on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar has a shared hit in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's hit plan under the named landing part", () => {
    const song = songWithHitPlan();
    song.sections[0]!.roles[0]!.hitPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.hitPlan = "Leave the vocal on the last lyric while the hit lands.";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.hitPlan =
      "Land this hit with Lead Vocal; don't drift past the downbeat.";

    render(<FirstHitPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand has a shared hit in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText("Land this hit with Lead Vocal; don't drift past the downbeat.")
    ).toBeTruthy();
    expect(screen.queryByText("Leave the vocal on the last lyric while the hit lands.")).toBeNull();
    expect(screen.queryByText(DEMO_HIT_PLAN)).toBeNull();
  });

  it("names the first hit plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstHitPlanCallout song={songWithHitPlan()} />);

    expect(screen.getByText(DEMO_HIT_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar hit at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Land that hit on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstHitPlanCallout song={songWithHitPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar hit at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Land that hit on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstHitPlanCallout song={songWithHitPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar hit at 0:10" }));

    expect(screen.getByText("Bass Guitar has a shared hit in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Land that hit on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithHitPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstHitPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar hit at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("fails closed when one workspace owns more than one song-structure renderer", () => {
    const firstScroll = vi.fn();
    const secondScroll = vi.fn();
    const { container } = render(
      <div>
        <FirstHitPlanCallout song={songWithHitPlan()} />
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

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar hit at 0:10" }));

    expect(firstScroll).not.toHaveBeenCalled();
    expect(secondScroll).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar has a shared hit in the verse at 0:10.")).toBeTruthy();
  });

  it("fails closed when more than one song-structure renderer is mounted globally", () => {
    const first = appendSongStructureTarget();
    const second = appendSongStructureTarget();

    render(<FirstHitPlanCallout song={songWithHitPlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar hit at 0:10" }));

    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(second.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText("Bass Guitar has a shared hit in the verse at 0:10.")).toBeTruthy();

    first.grid.remove();
    second.grid.remove();
  });
});
