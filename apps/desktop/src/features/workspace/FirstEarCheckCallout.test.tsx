import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstEarCheckCallout } from "./FirstEarCheckCallout";

function songWithEarCheck() {
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

describe("FirstEarCheckCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstEarCheckCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("Nothing still needs an ear check. Stay on tonight's map until a part is marked uncertain.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithEarCheck();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstEarCheckCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar ear check at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same ear-check signature", () => {
    const firstSong = songWithEarCheck();
    const nextSong = songWithEarCheck();
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
    const { rerender } = render(<FirstEarCheckCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar ear check at 0:10" }));
    expect(screen.getByText(/Confirm Bass Guitar by ear at 0:10 before the room starts./)).toBeTruthy();

    rerender(<FirstEarCheckCallout song={nextSong} />);

    expect(screen.getByText("Bass Guitar still needs an ear check in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Confirm Bass Guitar by ear at 0:10 before the room starts./)).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithEarCheck();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstEarCheckCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar ear check at 0:10" }));
    expect(screen.getByText(/Confirm Bass Guitar by ear at 0:10 before the room starts./)).toBeTruthy();

    rerender(<FirstEarCheckCallout song={{ ...song }} />);

    expect(screen.getByText(/Confirm Bass Guitar by ear at 0:10 before the room starts./)).toBeTruthy();
    expect(screen.queryByText("Bass Guitar still needs an ear check in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another uncertain part's notes under the named holding part", () => {
    const song = songWithEarCheck();
    song.sections[0]!.roles[0]!.confidence = {
      level: "low",
      source: "model",
      notes: ""
    };
    song.sections[0]!.roles[1]!.confidence = {
      level: "medium",
      source: "model",
      notes: "Check the keyboard voicing instead."
    };

    render(<FirstEarCheckCallout song={song} />);

    expect(screen.getByText("Bass Guitar still needs an ear check in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText("Check the keyboard voicing instead.")).toBeNull();
  });

  it("names the first ear check as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstEarCheckCallout song={songWithEarCheck()} />);

    expect(screen.getByText("Watch the slide into the turnaround.")).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar ear check at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Confirm Bass Guitar by ear at 0:10 before the room starts./)).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstEarCheckCallout song={songWithEarCheck()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar ear check at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Confirm Bass Guitar by ear at 0:10 before the room starts./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstEarCheckCallout song={songWithEarCheck()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar ear check at 0:10" }));

    expect(screen.getByText("Bass Guitar still needs an ear check in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Confirm Bass Guitar by ear at 0:10 before the room starts./)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithEarCheck();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstEarCheckCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar ear check at 0:10" }));
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

    render(<FirstEarCheckCallout song={songWithEarCheck()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar ear check at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first ear check changes or returns later", () => {
    const initialSong = songWithEarCheck();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstEarCheckCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar ear check at 0:10" }));
    expect(screen.getByText(/Confirm Bass Guitar by ear at 0:10 before the room starts./)).toBeTruthy();

    const nextSong = songWithEarCheck();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstEarCheckCallout song={nextSong} />);
    expect(screen.getByText("Bass Guitar still needs an ear check in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable ear check guidance-only", () => {
    const song = songWithEarCheck();
    song.sections[0]!.confidence = {
      level: "high",
      source: "model",
      notes: "Ready to trust the form."
    };
    for (const role of song.sections[0]!.roles) {
      role.confidence = {
        level: "high",
        source: "user",
        notes: "Confirmed in rehearsal notes."
      };
    }
    render(<FirstEarCheckCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("Nothing still needs an ear check. Stay on tonight's map until a part is marked uncertain.")
    ).toBeTruthy();
  });

  it("names a section-wide ear check when no part carries it", () => {
    const song = songWithEarCheck();
    for (const node of song.sections[0]!.partGraph) {
      node.is_active = false;
    }
    render(<FirstEarCheckCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first ear check at 0:10" })).toBeTruthy();
    expect(screen.getByText("The verse still needs an ear check at 0:10.")).toBeTruthy();
  });

  it("localizes the ear-check form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithEarCheck();
    song.sections[0]!.roles[0]!.name = "베이스 기타";
    song.sections[0]!.roles[1]!.rehearsalPriority = "low";
    song.sections[0]!.roles[2]!.rehearsalPriority = "low";

    render(<FirstEarCheckCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 기타 파트를 귀로 확인하세요.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned confidence notes as a text node instead of template syntax", () => {
    const song = songWithEarCheck();
    song.sections[0]!.roles[0]!.confidence = {
      level: "medium",
      source: "model",
      notes: "Check {role} at {at}"
    };
    song.sections[0]!.roles[1]!.confidence = {
      level: "high",
      source: "model",
      notes: "Ready"
    };
    song.sections[0]!.roles[2]!.confidence = {
      level: "high",
      source: "user",
      notes: "Confirmed"
    };
    render(<FirstEarCheckCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Bass Guitar at 0:10")).toBeNull();
  });
});
