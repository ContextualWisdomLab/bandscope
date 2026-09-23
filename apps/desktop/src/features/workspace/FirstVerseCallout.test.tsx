import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstVerseCallout } from "./FirstVerseCallout";

function songWithVerse() {
  const song = createDemoRehearsalSong();
  const seed = song.sections[0]!;
  const verse = structuredClone(seed);
  verse.id = "verse-1";
  verse.label = "verse";
  verse.timeRange = { start: 10, end: 30 };
  verse.roles = [
    {
      ...seed.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  verse.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse];
  return song;
}

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

describe("FirstVerseCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the first verse as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstVerseCallout song={songWithVerse()} />);

    const action = screen.getByRole("button", {
      name: "Open Lead Vocal verse at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Learn Lead Vocal's verse at 0:10. Play the first line./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstVerseCallout song={songWithVerse()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal verse at 0:10" }));

    expect(screen.getByText("Lead Vocal carries the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Learn Lead Vocal's verse at 0:10. Play the first line./)).toBeNull();
  });

  it("keeps workspace-scroll authoritative even when a playback callback is also supplied", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();
    const onHearVerse = vi.fn();

    render(
      <FirstVerseCallout song={songWithVerse()} actionMode="workspace-scroll" onHearVerse={onHearVerse} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal verse at 0:10" }));
    expect(onHearVerse).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithVerse();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstVerseCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal verse at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    grid.remove();
  });

  it("shows fresh guidance when the first verse changes or returns later", () => {
    const initialSong = songWithVerse();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstVerseCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal verse at 0:10" }));
    expect(screen.getByText(/Learn Lead Vocal's verse at 0:10. Play the first line./)).toBeTruthy();

    const nextSong = songWithVerse();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 48, end: 64 };
    rerender(<FirstVerseCallout song={nextSong} />);
    expect(screen.getByText("Lead Vocal carries the verse at 0:48.")).toBeTruthy();

    grid.remove();
  });

  it("does not carry completed guidance into a replacement song with an invalid runtime id", () => {
    const firstSong = songWithVerse();
    const replacementSong = songWithVerse();
    (firstSong as unknown as { id: unknown }).id = null;
    (replacementSong as unknown as { id: unknown }).id = null;
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstVerseCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal verse at 0:10" }));
    expect(screen.getByText(/Learn Lead Vocal's verse at 0:10. Play the first line./)).toBeTruthy();

    rerender(<FirstVerseCallout song={replacementSong} />);

    expect(screen.getByText("Lead Vocal carries the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Learn Lead Vocal's verse at 0:10. Play the first line./)).toBeNull();

    grid.remove();
  });

  it("keeps an unavailable verse guidance-only", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.label = "chorus";
    render(<FirstVerseCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No verse yet. Stay on tonight's map until the first verse is labeled.")
    ).toBeTruthy();
  });

  it("names a band-wide story line when no part holds the verse", () => {
    const song = songWithVerse();
    song.sections[0]!.partGraph[0]!.is_active = false;
    render(<FirstVerseCallout song={song} />);
    expect(screen.getByRole("button", { name: "Open the first verse at 0:10" })).toBeTruthy();
    expect(screen.getByText("The band carries the verse at 0:10.")).toBeTruthy();
  });

  it("renders Hear only in callback-only mode when a seek callback exists", () => {
    const onHearVerse = vi.fn();
    render(<FirstVerseCallout song={songWithVerse()} actionMode="callback-only" onHearVerse={onHearVerse} />);
    fireEvent.click(screen.getByRole("button", { name: "Hear Lead Vocal verse at 0:10" }));
    expect(onHearVerse).toHaveBeenCalledWith(10);
  });

  it("hides the Hear action in callback-only mode without a seek callback", () => {
    render(<FirstVerseCallout song={songWithVerse()} actionMode="callback-only" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Lead Vocal carries the verse at 0:10.")).toBeTruthy();
  });

  it("localizes the verse form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithVerse();
    song.sections[0]!.roles[0]!.name = "리드 보컬";

    render(<FirstVerseCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 리드 보컬 파트가 첫 소절을 잡습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });
});