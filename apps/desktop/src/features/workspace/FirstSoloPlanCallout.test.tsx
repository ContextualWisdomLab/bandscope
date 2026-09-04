import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstSoloPlanCallout } from "./FirstSoloPlanCallout";

const DEMO_SOLO_PLAN =
  "Hold the verse solo; everyone else drops to a two-bar pad so the run can land.";

function songWithSoloPlan() {
  return createDemoRehearsalSong();
}

function appendSongStructureTarget(
  parent: HTMLElement,
  sectionId = "verse-1",
  ariaLabel = "Scrollable song structure timeline"
) {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", ariaLabel);
  const grid = document.createElement("div");
  grid.id = "workspace-song-structure-grid";
  timeline.appendChild(grid);

  const target = document.createElement("div");
  target.dataset.sectionId = sectionId;
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });

  parent.append(timeline, target);
  return { scrollIntoView };
}

describe("FirstSoloPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstSoloPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No solo plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("fails closed on an accessor-backed runtime graph without invoking the getter", () => {
    const song = songWithSoloPlan();
    const readIdentity = vi.fn(() => {
      throw new Error("hostile song id getter");
    });
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get: readIdentity
    });

    expect(() => render(<FirstSoloPlanCallout song={song} />)).not.toThrow();
    expect(readIdentity).not.toHaveBeenCalled();
    expect(
      screen.getByText("No solo plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open .* solo at/ })).toBeNull();
  });

  it("keeps accessor-backed replacement songs unavailable without invoking either getter", () => {
    const firstSong = songWithSoloPlan();
    const nextSong = songWithSoloPlan();
    const firstRead = vi.fn(() => {
      throw new Error("first hostile song id getter");
    });
    const nextRead = vi.fn(() => {
      throw new Error("next hostile song id getter");
    });
    Object.defineProperty(firstSong, "id", {
      configurable: true,
      enumerable: true,
      get: firstRead
    });
    Object.defineProperty(nextSong, "id", {
      configurable: true,
      enumerable: true,
      get: nextRead
    });

    const { rerender } = render(<FirstSoloPlanCallout song={firstSong} />);
    expect(
      screen.getByText("No solo plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();

    rerender(<FirstSoloPlanCallout song={nextSong} />);

    expect(firstRead).not.toHaveBeenCalled();
    expect(nextRead).not.toHaveBeenCalled();
    expect(
      screen.getByText("No solo plan is available. Stay on tonight's map for the next rehearsal cue.")
    ).toBeTruthy();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithSoloPlan();
    const { container, rerender } = render(<FirstSoloPlanCallout song={song} />);
    appendSongStructureTarget(container, song.sections[0]!.id);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand solo at 0:10" }));
    expect(
      screen.getByText(/Lock that solo on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstSoloPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that solo on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Keyboard 1 Right Hand still has a solo plan in the verse at 0:10.")).toBeNull();
  });

  it("does not show another part's solo plan under the named holding part", () => {
    const song = songWithSoloPlan();
    song.sections[0]!.roles[0]!.soloPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.soloPlan = "Leave the bass on roots while the solo lands.";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.soloPlan =
      "Keep the right-hand figure under the vocal so the solo still reads.";

    render(<FirstSoloPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a solo plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText("Keep the right-hand figure under the vocal so the solo still reads.")
    ).toBeTruthy();
    expect(screen.queryByText("Leave the bass on roots while the solo lands.")).toBeNull();
    expect(screen.queryByText(DEMO_SOLO_PLAN)).toBeNull();
  });

  it("names the first solo plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const song = songWithSoloPlan();
    const { container } = render(<FirstSoloPlanCallout song={song} />);
    const { scrollIntoView } = appendSongStructureTarget(container, song.sections[0]!.id);

    expect(screen.getByText(DEMO_SOLO_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Keyboard 1 Right Hand solo at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that solo on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeTruthy();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const song = songWithSoloPlan();
    const { container } = render(<FirstSoloPlanCallout song={song} />);
    const { scrollIntoView } = appendSongStructureTarget(
      container,
      song.sections[0]!.id,
      "스크롤 가능한 곡 구조 타임라인"
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand solo at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that solo on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeTruthy();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstSoloPlanCallout song={songWithSoloPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand solo at 0:10" }));

    expect(screen.getByText("Keyboard 1 Right Hand still has a solo plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that solo on Keyboard 1 Right Hand at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by exact stable section identity without interpolating the id into a selector", () => {
    const song = songWithSoloPlan();
    song.sections[0]!.id = 'analysis section / [data-test="hostile"]';
    const { container } = render(<FirstSoloPlanCallout song={song} />);
    const { scrollIntoView } = appendSongStructureTarget(container, song.sections[0]!.id);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand solo at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("fails closed when more than one song-structure renderer is mounted in the current workspace", () => {
    const song = songWithSoloPlan();
    const { container } = render(<FirstSoloPlanCallout song={song} />);
    const first = appendSongStructureTarget(container, song.sections[0]!.id);
    const second = appendSongStructureTarget(container, song.sections[0]!.id);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand solo at 0:10" }));

    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(second.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText("Keyboard 1 Right Hand still has a solo plan in the verse at 0:10.")).toBeTruthy();
  });
});
