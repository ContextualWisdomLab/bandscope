import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstCapoPlanCallout } from "./FirstCapoPlanCallout";

const DEMO_CAPO_PLAN =
  "Capo 2 in standard tuning so the verse fingers G shapes while the room still sounds in A.";

function songWithCapoPlan() {
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

describe("FirstCapoPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstCapoPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "Nothing still has a capo plan. Stay on tonight's map until a guitar part owns rehearsal-facing capo copy."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithCapoPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstCapoPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Acoustic Guitar capo at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same capo signature", () => {
    const firstSong = songWithCapoPlan();
    const nextSong = songWithCapoPlan();
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
    const { rerender } = render(<FirstCapoPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Acoustic Guitar capo at 0:10" }));
    expect(
      screen.getByText(/Lock that capo on Acoustic Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstCapoPlanCallout song={nextSong} />);

    expect(screen.getByText("Acoustic Guitar still has a capo plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that capo on Acoustic Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithCapoPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstCapoPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Acoustic Guitar capo at 0:10" }));
    expect(
      screen.getByText(/Lock that capo on Acoustic Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstCapoPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that capo on Acoustic Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Acoustic Guitar still has a capo plan in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's capo plan under the named holding part", () => {
    const song = songWithCapoPlan();
    song.sections[0]!.roles[0]!.capoPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.capoPlan = "Capo 3 in standard tuning so the chorus fingers F shapes.";
    song.sections[0]!.roles[2]!.capoPlan = "Capo 4, drop the top string if the chorus still bites.";
    song.sections[0]!.roles[3]!.capoPlan = "";
    song.sections[0]!.roles[3]!.rehearsalPriority = "low";

    render(<FirstCapoPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a capo plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(screen.getByText("Capo 3 in standard tuning so the chorus fingers F shapes.")).toBeTruthy();
    expect(screen.queryByText("Capo 4, drop the top string if the chorus still bites.")).toBeNull();
    expect(screen.queryByText(DEMO_CAPO_PLAN)).toBeNull();
  });

  it("names the first capo plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstCapoPlanCallout song={songWithCapoPlan()} />);

    expect(screen.getByText(DEMO_CAPO_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Acoustic Guitar capo at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that capo on Acoustic Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstCapoPlanCallout song={songWithCapoPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Acoustic Guitar capo at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that capo on Acoustic Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstCapoPlanCallout song={songWithCapoPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Acoustic Guitar capo at 0:10" }));

    expect(screen.getByText("Acoustic Guitar still has a capo plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that capo on Acoustic Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithCapoPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstCapoPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Acoustic Guitar capo at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("scopes map navigation to the song-structure renderer when another surface reuses an index", () => {
    const decoy = document.createElement("div");
    decoy.dataset.sectionIndex = "0";
    const decoyScrollIntoView = vi.fn();
    Object.defineProperty(decoy, "scrollIntoView", {
      configurable: true,
      value: decoyScrollIntoView
    });
    document.body.appendChild(decoy);
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstCapoPlanCallout song={songWithCapoPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Acoustic Guitar capo at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first capo plan changes or returns later", () => {
    const initialSong = songWithCapoPlan();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstCapoPlanCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Acoustic Guitar capo at 0:10" }));
    expect(
      screen.getByText(/Lock that capo on Acoustic Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithCapoPlan();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstCapoPlanCallout song={nextSong} />);
    expect(screen.getByText("Acoustic Guitar still has a capo plan in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable capo plan guidance-only", () => {
    const song = songWithCapoPlan();
    for (const role of song.sections[0]!.roles) {
      role.capoPlan = "";
    }
    render(<FirstCapoPlanCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText(
        "Nothing still has a capo plan. Stay on tonight's map until a guitar part owns rehearsal-facing capo copy."
      )
    ).toBeTruthy();
  });

  it("localizes the capo-plan form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithCapoPlan();
    song.sections[0]!.roles[3]!.name = "기타";

    render(<FirstCapoPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 기타 파트의 카포 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned capo plan as a text node instead of template syntax", () => {
    const song = songWithCapoPlan();
    song.sections[0]!.roles[1]!.capoPlan = "";
    song.sections[0]!.roles[2]!.capoPlan = "";
    song.sections[0]!.roles[3]!.capoPlan = "";
    song.sections[0]!.roles[0]!.capoPlan = "Check {role} at {at}";
    render(<FirstCapoPlanCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Acoustic Guitar at 0:10")).toBeNull();
  });
});
