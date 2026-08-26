import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTranspositionPlanCallout } from "./FirstTranspositionPlanCallout";

const DEMO_TRANSPOSITION_PLAN =
  "If the singer drops to B minor, keep the shape a whole step lower and let keys keep the color tones.";

const appendedRoots: HTMLElement[] = [];

function songWithTranspositionPlan() {
  return createDemoRehearsalSong();
}

function appendTrackedRoot(element: HTMLElement) {
  document.body.appendChild(element);
  appendedRoots.push(element);
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
  appendTrackedRoot(timeline);
  return { timeline, scrollIntoView };
}

describe("FirstTranspositionPlanCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    while (appendedRoots.length > 0) {
      appendedRoots.pop()?.remove();
    }
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstTranspositionPlanCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "No part has a transpose plan yet. Keep working from tonight's map until one appears."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithTranspositionPlan();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstTranspositionPlanCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar transpose at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same transpose signature", () => {
    const firstSong = songWithTranspositionPlan();
    const nextSong = songWithTranspositionPlan();
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
    const { rerender } = render(<FirstTranspositionPlanCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transpose at 0:10" }));
    expect(
      screen.getByText(/Lock that transpose on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstTranspositionPlanCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still has a transpose plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that transpose on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithTranspositionPlan();
    appendSongStructureTarget();
    const { rerender } = render(<FirstTranspositionPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transpose at 0:10" }));
    expect(
      screen.getByText(/Lock that transpose on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstTranspositionPlanCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Lock that transpose on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still has a transpose plan in the verse at 0:10.")).toBeNull();
  });

  it("does not show another part's transposition plan under the named holding part", () => {
    const song = songWithTranspositionPlan();
    song.sections[0]!.roles[0]!.transpositionPlan = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.transpositionPlan = "If the band rehearses in D, keep the voicing in first inversion.";
    song.sections[0]!.roles[2]!.transpositionPlan = "Move the section down a whole step.";

    render(<FirstTranspositionPlanCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a transpose plan in the verse at 0:10.")
    ).toBeTruthy();
    expect(screen.getByText("If the band rehearses in D, keep the voicing in first inversion.")).toBeTruthy();
    expect(screen.queryByText("Move the section down a whole step.")).toBeNull();
    expect(screen.queryByText(DEMO_TRANSPOSITION_PLAN)).toBeNull();
  });

  it("names the first transposition plan as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { scrollIntoView } = appendSongStructureTarget();

    render(<FirstTranspositionPlanCallout song={songWithTranspositionPlan()} />);

    expect(screen.getByText(DEMO_TRANSPOSITION_PLAN)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar transpose at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that transpose on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstTranspositionPlanCallout song={songWithTranspositionPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transpose at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Lock that transpose on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstTranspositionPlanCallout song={songWithTranspositionPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transpose at 0:10" }));

    expect(screen.getByText("Bass Guitar still has a transpose plan in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Lock that transpose on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithTranspositionPlan();
    song.sections[0]!.id = "analysis section / duplicate";
    const { scrollIntoView } = appendSongStructureTarget();

    render(<FirstTranspositionPlanCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transpose at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("scopes map navigation to the song-structure renderer when another surface reuses an index", () => {
    const decoy = document.createElement("div");
    decoy.dataset.sectionIndex = "0";
    const decoyScrollIntoView = vi.fn();
    Object.defineProperty(decoy, "scrollIntoView", {
      configurable: true,
      value: decoyScrollIntoView
    });
    appendTrackedRoot(decoy);
    const { scrollIntoView } = appendSongStructureTarget();

    render(<FirstTranspositionPlanCallout song={songWithTranspositionPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transpose at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("shows fresh guidance when the first transposition plan changes or returns later", () => {
    const initialSong = songWithTranspositionPlan();
    appendSongStructureTarget();
    const { rerender } = render(<FirstTranspositionPlanCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transpose at 0:10" }));
    expect(
      screen.getByText(/Lock that transpose on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithTranspositionPlan();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstTranspositionPlanCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still has a transpose plan in the verse at 0:20.")).toBeTruthy();
  });

  it("keeps an unavailable transposition plan guidance-only", () => {
    const song = songWithTranspositionPlan();
    for (const role of song.sections[0]!.roles) {
      role.transpositionPlan = "";
    }
    render(<FirstTranspositionPlanCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText(
        "No part has a transpose plan yet. Keep working from tonight's map until one appears."
      )
    ).toBeTruthy();
  });

  it("localizes the transposition-plan form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithTranspositionPlan();
    song.sections[0]!.roles[0]!.name = "베이스";

    render(<FirstTranspositionPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 파트의 이조 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned transposition plan as a text node instead of template syntax", () => {
    const song = songWithTranspositionPlan();
    song.sections[0]!.roles[1]!.transpositionPlan = "";
    song.sections[0]!.roles[2]!.transpositionPlan = "";
    song.sections[0]!.roles[0]!.transpositionPlan = "Check {role} at {at}";
    render(<FirstTranspositionPlanCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10")).toBeNull();
  });
});
