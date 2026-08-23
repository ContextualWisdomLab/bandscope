import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTagCallout } from "./FirstTagCallout";

function songWithTag() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const tag = structuredClone(verse);
  tag.id = "tag-1";
  tag.label = "tag";
  tag.timeRange = { start: 200, end: 208 };
  tag.roles = [
    {
      ...verse.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  tag.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, tag];
  return song;
}

function appendSongStructureTarget() {
  const timeline = document.createElement("div");
  timeline.setAttribute("role", "region");
  timeline.setAttribute("aria-label", "Scrollable song structure timeline");
  const grid = document.createElement("div");
  const first = document.createElement("div");
  first.dataset.sectionIndex = "0";
  const unrelatedSibling = document.createElement("div");
  const target = document.createElement("div");
  target.dataset.sectionIndex = "1";
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(first);
  grid.appendChild(unrelatedSibling);
  grid.appendChild(target);
  timeline.appendChild(grid);
  document.body.appendChild(timeline);
  return { grid: timeline, scrollIntoView };
}

describe("FirstTagCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstTagCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No tag yet. Stay on tonight's map until the last line is labeled.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithTag();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstTagCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Lead Vocal tag at 3:20" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same tag signature", () => {
    const firstSong = songWithTag();
    const nextSong = songWithTag();
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
    const { rerender } = render(<FirstTagCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal tag at 3:20" }));
    expect(screen.getByText(/Catch the last line with Lead Vocal at 3:20. End together./)).toBeTruthy();

    rerender(<FirstTagCallout song={nextSong} />);

    expect(screen.getByText("Lead Vocal holds the tag at 3:20.")).toBeTruthy();
    expect(screen.queryByText(/Catch the last line with Lead Vocal at 3:20. End together./)).toBeNull();

    grid.remove();
  });

  it("names the first tag as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstTagCallout song={songWithTag()} />);

    const action = screen.getByRole("button", {
      name: "Open Lead Vocal tag at 3:20"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Catch the last line with Lead Vocal at 3:20. End together./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstTagCallout song={songWithTag()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal tag at 3:20" }));

    expect(screen.getByText("Lead Vocal holds the tag at 3:20.")).toBeTruthy();
    expect(screen.queryByText(/Catch the last line with Lead Vocal at 3:20. End together./)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithTag();
    song.sections[1]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstTagCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal tag at 3:20" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("scopes map navigation to the song-structure renderer when another surface reuses an index", () => {
    const decoy = document.createElement("div");
    decoy.dataset.sectionIndex = "1";
    const decoyScrollIntoView = vi.fn();
    Object.defineProperty(decoy, "scrollIntoView", {
      configurable: true,
      value: decoyScrollIntoView
    });
    document.body.appendChild(decoy);
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstTagCallout song={songWithTag()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal tag at 3:20" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first tag changes or returns later", () => {
    const initialSong = songWithTag();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstTagCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal tag at 3:20" }));
    expect(screen.getByText(/Catch the last line with Lead Vocal at 3:20. End together./)).toBeTruthy();

    const nextSong = songWithTag();
    nextSong.id = "next-song";
    nextSong.sections[1]!.timeRange = { start: 220, end: 228 };
    rerender(<FirstTagCallout song={nextSong} />);
    expect(screen.getByText("Lead Vocal holds the tag at 3:40.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable tag guidance-only", () => {
    render(<FirstTagCallout song={createDemoRehearsalSong()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No tag yet. Stay on tonight's map until the last line is labeled.")
    ).toBeTruthy();
  });

  it("names a band-wide last line when no part holds the tag", () => {
    const song = songWithTag();
    song.sections[1]!.partGraph[0]!.is_active = false;
    render(<FirstTagCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first tag at 3:20" })).toBeTruthy();
    expect(screen.getByText("The band catches the tag at 3:20.")).toBeTruthy();
  });

  it("localizes the tag form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithTag();
    song.sections[1]!.roles[0]!.name = "리드 보컬";

    render(<FirstTagCallout song={song} />);

    expect(screen.getByText("3:20 태그에서 리드 보컬 파트가 마지막 한 줄을 잡습니다.")).toBeTruthy();
    expect(screen.queryByText(/tag에서/)).toBeNull();
  });
});
