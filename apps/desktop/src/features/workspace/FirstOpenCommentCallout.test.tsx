import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstOpenCommentCallout } from "./FirstOpenCommentCallout";

function songWithOpenComment() {
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

describe("FirstOpenCommentCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstOpenCommentCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No open note yet. Stay on tonight's map until someone leaves a rehearsal comment.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithOpenComment();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstOpenCommentCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same comment signature", () => {
    const firstSong = songWithOpenComment();
    const nextSong = songWithOpenComment();
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
    const { rerender } = render(<FirstOpenCommentCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand at 0:10" }));
    expect(
      screen.getByText(/Read MD's note with Keyboard 1 Right Hand at 0:10. Keep that part in view./)
    ).toBeTruthy();

    rerender(<FirstOpenCommentCallout song={nextSong} />);

    expect(screen.getByText("MD left a note for Keyboard 1 Right Hand in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Read MD's note with Keyboard 1 Right Hand at 0:10. Keep that part in view./)
    ).toBeNull();

    grid.remove();
  });

  it("names the first open note as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstOpenCommentCallout song={songWithOpenComment()} />);

    expect(
      screen.getByText("Keep the keyboard color tone gentle on the first pass so the vocal cue stays forward.")
    ).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Keyboard 1 Right Hand at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Read MD's note with Keyboard 1 Right Hand at 0:10. Keep that part in view./)
    ).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstOpenCommentCallout song={songWithOpenComment()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(
      screen.getByText(/Read MD's note with Keyboard 1 Right Hand at 0:10. Keep that part in view./)
    ).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstOpenCommentCallout song={songWithOpenComment()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand at 0:10" }));

    expect(screen.getByText("MD left a note for Keyboard 1 Right Hand in the verse at 0:10.")).toBeTruthy();
    expect(
      screen.queryByText(/Read MD's note with Keyboard 1 Right Hand at 0:10. Keep that part in view./)
    ).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithOpenComment();
    song.sections[0]!.id = "analysis section / duplicate";
    song.collaboration!.comments[0]!.sectionId = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstOpenCommentCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand at 0:10" }));
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

    render(<FirstOpenCommentCallout song={songWithOpenComment()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first open note changes or returns later", () => {
    const initialSong = songWithOpenComment();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstOpenCommentCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard 1 Right Hand at 0:10" }));
    expect(
      screen.getByText(/Read MD's note with Keyboard 1 Right Hand at 0:10. Keep that part in view./)
    ).toBeTruthy();

    const nextSong = songWithOpenComment();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstOpenCommentCallout song={nextSong} />);
    expect(screen.getByText("MD left a note for Keyboard 1 Right Hand in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable note guidance-only", () => {
    const song = songWithOpenComment();
    for (const comment of song.collaboration!.comments) {
      comment.status = "resolved";
    }
    render(<FirstOpenCommentCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No open note yet. Stay on tonight's map until someone leaves a rehearsal comment.")
    ).toBeTruthy();
  });

  it("names a section-wide note when no part carries it", () => {
    const song = songWithOpenComment();
    delete song.collaboration!.comments[0]!.roleId;
    const { grid, scrollIntoView } = appendSongStructureTarget();
    render(<FirstOpenCommentCallout song={song} />);
    const action = screen.getByRole("button", { name: "Open the first note at 0:10" });
    expect(screen.getByText("MD left a note in the verse at 0:10.")).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText("Read MD's note at 0:10. Keep that section in view.")).toBeTruthy();
    grid.remove();
  });

  it("localizes the comment form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithOpenComment();
    song.sections[0]!.roles[1]!.name = "키보드 오른손";

    render(<FirstOpenCommentCallout song={song} />);

    expect(screen.getByText("MD님이 0:10 벌스에서 키보드 오른손 파트에 메모를 남겼습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned comment body as a text node instead of template syntax", () => {
    const song = songWithOpenComment();
    song.collaboration!.comments[0]!.body = "Keep {role} gentle at {at}";
    render(<FirstOpenCommentCallout song={song} />);
    expect(screen.getByText("Keep {role} gentle at {at}")).toBeTruthy();
    expect(screen.queryByText("Keep Keyboard 1 Right Hand gentle at 0:10")).toBeNull();
  });
});
