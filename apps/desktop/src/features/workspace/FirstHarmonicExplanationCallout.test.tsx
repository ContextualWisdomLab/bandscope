import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHarmonicExplanationCallout } from "./FirstHarmonicExplanationCallout";

const DEMO_EXPLANATION =
  "The bass holds the vi center so the rest of the section can lean into the pickup without losing the tonal floor.";

function songWithHarmonicExplanation() {
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

describe("FirstHarmonicExplanationCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstHarmonicExplanationCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText(
        "Nothing still has a harmonic explanation. Stay on tonight's map until a part owns rehearsal-facing harmony copy."
      )
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithHarmonicExplanation();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstHarmonicExplanationCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same explanation signature", () => {
    const firstSong = songWithHarmonicExplanation();
    const nextSong = songWithHarmonicExplanation();
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
    const { rerender } = render(<FirstHarmonicExplanationCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" }));
    expect(
      screen.getByText(/Play from that explanation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstHarmonicExplanationCallout song={nextSong} />);

    expect(
      screen.getByText("Bass Guitar still has a harmonic explanation in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.queryByText(/Play from that explanation on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithHarmonicExplanation();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstHarmonicExplanationCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" }));
    expect(
      screen.getByText(/Play from that explanation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    rerender(<FirstHarmonicExplanationCallout song={{ ...song }} />);

    expect(
      screen.getByText(/Play from that explanation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
    expect(
      screen.queryByText("Bass Guitar still has a harmonic explanation in the verse at 0:10.")
    ).toBeNull();

    grid.remove();
  });

  it("does not show another part's explanation under the named holding part", () => {
    const song = songWithHarmonicExplanation();
    song.sections[0]!.roles[0]!.harmonicExplanation = "";
    song.sections[0]!.roles[0]!.rehearsalPriority = "low";
    song.sections[0]!.roles[1]!.harmonicExplanation = "Check the keyboard voicing instead.";
    song.sections[0]!.roles[2]!.harmonicExplanation = "The ninth is the reason this lift works.";

    render(<FirstHarmonicExplanationCallout song={song} />);

    expect(
      screen.getByText("Keyboard 1 Right Hand still has a harmonic explanation in the verse at 0:10.")
    ).toBeTruthy();
    expect(screen.getByText("Check the keyboard voicing instead.")).toBeTruthy();
    expect(screen.queryByText("The ninth is the reason this lift works.")).toBeNull();
    expect(screen.queryByText(DEMO_EXPLANATION)).toBeNull();
  });

  it("names the first harmonic explanation as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstHarmonicExplanationCallout song={songWithHarmonicExplanation()} />);

    expect(screen.getByText(DEMO_EXPLANATION)).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar explanation at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Play from that explanation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstHarmonicExplanationCallout song={songWithHarmonicExplanation()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Play from that explanation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstHarmonicExplanationCallout song={songWithHarmonicExplanation()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" }));

    expect(
      screen.getByText("Bass Guitar still has a harmonic explanation in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.queryByText(/Play from that explanation on Bass Guitar at 0:10 before the room starts./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithHarmonicExplanation();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstHarmonicExplanationCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" }));
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

    render(<FirstHarmonicExplanationCallout song={songWithHarmonicExplanation()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first harmonic explanation changes or returns later", () => {
    const initialSong = songWithHarmonicExplanation();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstHarmonicExplanationCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" }));
    expect(
      screen.getByText(/Play from that explanation on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    const nextSong = songWithHarmonicExplanation();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstHarmonicExplanationCallout song={nextSong} />);
    expect(
      screen.getByText("Bass Guitar still has a harmonic explanation in the verse at 0:20.")
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable harmonic explanation guidance-only", () => {
    const song = songWithHarmonicExplanation();
    for (const role of song.sections[0]!.roles) {
      delete role.harmonicExplanation;
    }
    render(<FirstHarmonicExplanationCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText(
        "Nothing still has a harmonic explanation. Stay on tonight's map until a part owns rehearsal-facing harmony copy."
      )
    ).toBeTruthy();
  });

  it("localizes the harmonic-explanation form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithHarmonicExplanation();
    song.sections[0]!.roles[0]!.name = "베이스";

    render(<FirstHarmonicExplanationCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 파트의 화성 설명이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned explanation as a text node instead of template syntax", () => {
    const song = songWithHarmonicExplanation();
    song.sections[0]!.roles[1]!.harmonicExplanation = undefined;
    song.sections[0]!.roles[2]!.harmonicExplanation = undefined;
    song.sections[0]!.roles[0]!.harmonicExplanation = "Check {role} at {at}";
    render(<FirstHarmonicExplanationCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10")).toBeNull();
  });
});
