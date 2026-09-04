import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstLyricCueCallout } from "./FirstLyricCueCallout";

function appendSongStructureTarget() {
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const target = document.createElement("div");
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(target);
  document.body.appendChild(grid);
  return { grid, scrollIntoView };
}

/** Mount a renderer-owned map whose children mirror rendered section order one-to-one. */
function appendSongStructureGrid(childCount: number) {
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const scrolls = Array.from({ length: childCount }, () => {
    const child = document.createElement("div");
    const scrollIntoView = vi.fn();
    Object.defineProperty(child, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    grid.appendChild(child);
    return scrollIntoView;
  });
  document.body.appendChild(grid);
  return { grid, scrolls };
}

describe("FirstLyricCueCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.querySelectorAll('[data-testid="song-structure-grid"]').forEach((node) => node.remove());
  });

  it("names the first lyric cue as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstLyricCueCallout song={createDemoRehearsalSong()} />);

    const action = screen.getByRole("button", {
      name: "Open Lead Vocal lyric cue “city lights” in the verse at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Start on Lead Vocal in the verse at “city lights” \(0:10\)/)).toBeTruthy();

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstLyricCueCallout song={song} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Lead Vocal lyric cue “city lights” in the verse at 0:10"
      })
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first lyric cue changes or returns later", () => {
    const initialSong = createDemoRehearsalSong();
    const { grid } = appendSongStructureTarget();
    try {
      const { rerender } = render(<FirstLyricCueCallout song={initialSong} />);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Open Lead Vocal lyric cue “city lights” in the verse at 0:10"
        })
      );
      expect(screen.getByText(/Start on Lead Vocal in the verse at “city lights” \(0:10\)/)).toBeTruthy();

      const replacementSong = createDemoRehearsalSong();
      replacementSong.id = "demo-song-replacement";
      replacementSong.sections[0]!.roles[2]!.cue.value = "hold on";
      rerender(<FirstLyricCueCallout song={replacementSong} />);
      expect(screen.getByText("Lead Vocal enters the verse on “hold on” at 0:10.")).toBeTruthy();

      rerender(<FirstLyricCueCallout song={initialSong} />);
      expect(screen.getByText("Lead Vocal enters the verse on “city lights” at 0:10.")).toBeTruthy();
    } finally {
      grid.remove();
    }
  });

  it("keeps placeholder-looking rehearsal data literal", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[2]!.name = "{section}";

    render(<FirstLyricCueCallout song={song} />);

    expect(
      screen.getByRole("button", {
        name: "Open {section} lyric cue “city lights” in the verse at 0:10"
      })
    ).toBeTruthy();
  });

  it("keeps dynamic Korean role names particle-safe without guessing Hangul morphology", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[2]!.name = "피아노";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstLyricCueCallout song={song} />);

    expect(screen.getByText("0:10 verse에서 피아노 파트가 “city lights”으로 들어옵니다.")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "0:10 verse의 피아노 가사 큐 “city lights” 위치 열기"
      })
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText("verse의 피아노 파트를 “city lights” (0:10)에서 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노을|피아노이/)).toBeNull();

    grid.remove();
  });

  it("navigates by rendered section position even when analysis start times are unordered", () => {
    const base = createDemoRehearsalSong().sections[0]!;
    const ghost = structuredClone(base);
    ghost.id = "rendered-first-invalid-start";
    ghost.timeRange.start = Number.NaN;
    const late = structuredClone(base);
    late.id = "rendered-second-later-start";
    late.timeRange.start = 30;
    const early = structuredClone(base);
    early.id = "rendered-third-earliest-start";
    early.timeRange.start = 5;
    const song = createDemoRehearsalSong();
    song.sections = [ghost, late, early];

    const { grid, scrolls } = appendSongStructureGrid(3);

    render(<FirstLyricCueCallout song={song} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Lead Vocal lyric cue “city lights” in the verse at 0:05"
      })
    );

    expect(scrolls[2]).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(scrolls[0]).not.toHaveBeenCalled();
    expect(scrolls[1]).not.toHaveBeenCalled();

    grid.remove();
  });

  it("stays on fresh guidance when the rendered map is missing entirely", () => {
    render(<FirstLyricCueCallout song={createDemoRehearsalSong()} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Lead Vocal lyric cue “city lights” in the verse at 0:10"
      })
    );

    expect(screen.getByText("Lead Vocal enters the verse on “city lights” at 0:10.")).toBeTruthy();
  });

  it("stays on fresh guidance when the rendered map lacks the cue's section node", () => {
    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    document.body.appendChild(grid);

    try {
      render(<FirstLyricCueCallout song={createDemoRehearsalSong()} />);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Open Lead Vocal lyric cue “city lights” in the verse at 0:10"
        })
      );

      expect(screen.getByText("Lead Vocal enters the verse on “city lights” at 0:10.")).toBeTruthy();
    } finally {
      grid.remove();
    }
  });

  it("arms callback-only playback once the player accepts the cue", () => {
    const onHearLyricCue = vi.fn();

    render(
      <FirstLyricCueCallout
        song={createDemoRehearsalSong()}
        actionMode="callback-only"
        onHearLyricCue={onHearLyricCue}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Hear Lead Vocal enter on “city lights” in the verse at 0:10"
      })
    );

    expect(onHearLyricCue).toHaveBeenCalledTimes(1);
    expect(onHearLyricCue).toHaveBeenCalledWith(10);
    expect(screen.getByText(/Start on Lead Vocal in the verse at “city lights” \(0:10\)/)).toBeTruthy();
  });

  it("tells the room to stay on the map when no lyric exists", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];
    render(<FirstLyricCueCallout song={song} />);
    expect(
      screen.getByText("No lyric cue yet. Stay on tonight's map until a part has words to hear.")
    ).toBeTruthy();
  });
});
