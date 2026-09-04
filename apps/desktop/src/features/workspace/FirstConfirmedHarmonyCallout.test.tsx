import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstConfirmedHarmonyCallout } from "./FirstConfirmedHarmonyCallout";

function songWithConfirmedHarmony() {
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

describe("FirstConfirmedHarmonyCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstConfirmedHarmonyCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("Nothing still has a confirmed chord. Stay on tonight's map until a part is marked user-confirmed.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithConfirmedHarmony();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstConfirmedHarmonyCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Lead Vocal confirmed C#m11 at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same confirmed-harmony signature", () => {
    const firstSong = songWithConfirmedHarmony();
    const nextSong = songWithConfirmedHarmony();
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
    const { rerender } = render(<FirstConfirmedHarmonyCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal confirmed C#m11 at 0:10" }));
    expect(screen.getByText(/Play C#m11 on Lead Vocal at 0:10 before the room starts./)).toBeTruthy();

    rerender(<FirstConfirmedHarmonyCallout song={nextSong} />);

    expect(screen.getByText("Lead Vocal still has a confirmed C#m11 in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Play C#m11 on Lead Vocal at 0:10 before the room starts./)).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithConfirmedHarmony();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstConfirmedHarmonyCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal confirmed C#m11 at 0:10" }));
    expect(screen.getByText(/Play C#m11 on Lead Vocal at 0:10 before the room starts./)).toBeTruthy();

    rerender(<FirstConfirmedHarmonyCallout song={{ ...song }} />);

    expect(screen.getByText(/Play C#m11 on Lead Vocal at 0:10 before the room starts./)).toBeTruthy();
    expect(screen.queryByText("Lead Vocal still has a confirmed C#m11 in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("does not show another part's function label under the named holding part", () => {
    const song = songWithConfirmedHarmony();
    song.sections[0]!.roles[2]!.manualOverrides = [
      {
        field: "harmony",
        value: {
          chord: "C#m11",
          functionLabel: "",
          source: "user"
        },
        source: "user"
      }
    ];
    song.sections[0]!.roles[1]!.manualOverrides = [
      {
        field: "harmony",
        value: {
          chord: "Emaj9",
          functionLabel: "Check the keyboard voicing instead.",
          source: "user"
        },
        source: "user"
      }
    ];

    render(<FirstConfirmedHarmonyCallout song={song} />);

    expect(screen.getByText("Keyboard 1 Right Hand still has a confirmed Emaj9 in the verse at 0:10.")).toBeTruthy();
    expect(screen.getByText("Check the keyboard voicing instead.")).toBeTruthy();
    expect(screen.queryByText("vi suspended lift")).toBeNull();
  });

  it("names the first confirmed chord as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstConfirmedHarmonyCallout song={songWithConfirmedHarmony()} />);

    expect(screen.getByText("vi suspended lift")).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Lead Vocal confirmed C#m11 at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Play C#m11 on Lead Vocal at 0:10 before the room starts./)).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstConfirmedHarmonyCallout song={songWithConfirmedHarmony()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal confirmed C#m11 at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Play C#m11 on Lead Vocal at 0:10 before the room starts./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstConfirmedHarmonyCallout song={songWithConfirmedHarmony()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal confirmed C#m11 at 0:10" }));

    expect(screen.getByText("Lead Vocal still has a confirmed C#m11 in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Play C#m11 on Lead Vocal at 0:10 before the room starts./)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithConfirmedHarmony();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstConfirmedHarmonyCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal confirmed C#m11 at 0:10" }));
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

    render(<FirstConfirmedHarmonyCallout song={songWithConfirmedHarmony()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal confirmed C#m11 at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first confirmed chord changes or returns later", () => {
    const initialSong = songWithConfirmedHarmony();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstConfirmedHarmonyCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal confirmed C#m11 at 0:10" }));
    expect(screen.getByText(/Play C#m11 on Lead Vocal at 0:10 before the room starts./)).toBeTruthy();

    const nextSong = songWithConfirmedHarmony();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstConfirmedHarmonyCallout song={nextSong} />);
    expect(screen.getByText("Lead Vocal still has a confirmed C#m11 in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable confirmed chord guidance-only", () => {
    const song = songWithConfirmedHarmony();
    for (const role of song.sections[0]!.roles) {
      role.manualOverrides = [];
    }
    render(<FirstConfirmedHarmonyCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("Nothing still has a confirmed chord. Stay on tonight's map until a part is marked user-confirmed.")
    ).toBeTruthy();
  });

  it("localizes the confirmed-harmony form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithConfirmedHarmony();
    song.sections[0]!.roles[2]!.name = "리드 보컬";

    render(<FirstConfirmedHarmonyCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 리드 보컬 파트의 확인된 코드는 C#m11입니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned function label as a text node instead of template syntax", () => {
    const song = songWithConfirmedHarmony();
    song.sections[0]!.roles[2]!.manualOverrides = [
      {
        field: "harmony",
        value: {
          chord: "C#m11",
          functionLabel: "Check {role} at {at}",
          source: "user"
        },
        source: "user"
      }
    ];
    render(<FirstConfirmedHarmonyCallout song={song} />);
    expect(screen.getByText("Check {role} at {at}")).toBeTruthy();
    expect(screen.queryByText("Check Lead Vocal at 0:10")).toBeNull();
  });
});
