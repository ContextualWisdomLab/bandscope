import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstBlockedCallout } from "./FirstBlockedCallout";

function songWithBlocked() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "verse-blocked";
  song.sections = [section];
  song.collaboration = {
    syncMode: "local_only",
    syncNote: "Keep blocked jobs local for now.",
    assignments: [
      {
        id: "assign-keys-blocked",
        assignee: "Keys",
        summary: "Wait on the in-ear mix before the verse color pass.",
        sectionId: "verse-blocked",
        roleId: "keys-right",
        status: "blocked"
      }
    ],
    comments: [],
    approvals: []
  };
  return song;
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

describe("FirstBlockedCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstBlockedCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No blocked job yet. Stay on tonight's map until a part is stuck.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithBlocked();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstBlockedCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open verse blocker at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same blocked signature", () => {
    const firstSong = songWithBlocked();
    const nextSong = songWithBlocked();
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
    const { rerender } = render(<FirstBlockedCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse blocker at 0:10" }));
    expect(screen.getByText(/Unblock the verse job at 0:10 before the next run./)).toBeTruthy();

    rerender(<FirstBlockedCallout song={nextSong} />);

    expect(screen.getByText("Keys is blocked on Keyboard 1 Right Hand in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Unblock the verse job at 0:10 before the next run./)).toBeNull();

    grid.remove();
  });

  it("preserves armed guidance across immutable edits of the same owned song", () => {
    const song = songWithBlocked();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstBlockedCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse blocker at 0:10" }));
    expect(screen.getByText(/Unblock the verse job at 0:10 before the next run./)).toBeTruthy();

    rerender(<FirstBlockedCallout song={{ ...song }} />);

    expect(screen.getByText(/Unblock the verse job at 0:10 before the next run./)).toBeTruthy();
    expect(screen.queryByText("Keys is blocked on Keyboard 1 Right Hand in the verse at 0:10.")).toBeNull();

    grid.remove();
  });

  it("names the first blocked job as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstBlockedCallout song={songWithBlocked()} />);

    expect(screen.getByText("Keys is blocked on Keyboard 1 Right Hand in the verse at 0:10.")).toBeTruthy();
    expect(screen.getByText("Wait on the in-ear mix before the verse color pass.")).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open verse blocker at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Unblock the verse job at 0:10 before the next run./)).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstBlockedCallout song={songWithBlocked()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse blocker at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Unblock the verse job at 0:10 before the next run./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstBlockedCallout song={songWithBlocked()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse blocker at 0:10" }));

    expect(screen.getByText("Keys is blocked on Keyboard 1 Right Hand in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Unblock the verse job at 0:10 before the next run./)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithBlocked();
    song.sections[0]!.id = "analysis section / duplicate";
    song.collaboration!.assignments[0]!.sectionId = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstBlockedCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse blocker at 0:10" }));
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

    render(<FirstBlockedCallout song={songWithBlocked()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse blocker at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first blocked job changes or returns later", () => {
    const initialSong = songWithBlocked();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstBlockedCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open verse blocker at 0:10" }));
    expect(screen.getByText(/Unblock the verse job at 0:10 before the next run./)).toBeTruthy();

    const nextSong = songWithBlocked();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstBlockedCallout song={nextSong} />);
    expect(screen.getByText("Keys is blocked on Keyboard 1 Right Hand in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable blocked job guidance-only", () => {
    const song = createDemoRehearsalSong();
    render(<FirstBlockedCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No blocked job yet. Stay on tonight's map until a part is stuck.")
    ).toBeTruthy();
  });

  it("names a band-wide blocked job when the holding role is missing", () => {
    const song = songWithBlocked();
    delete song.collaboration!.assignments[0]!.roleId;
    const { grid, scrollIntoView } = appendSongStructureTarget();
    render(<FirstBlockedCallout song={song} />);
    expect(screen.getByText("Keys is blocked in the verse at 0:10.")).toBeTruthy();
    const action = screen.getByRole("button", { name: "Open the blocked job at 0:10" });
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText("Unblock the job at 0:10 before the next run.")).toBeTruthy();
    grid.remove();
  });

  it("localizes the blocked form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithBlocked();

    render(<FirstBlockedCallout song={song} />);

    expect(screen.getByText("Keys님이 0:10 벌스에서 Keyboard 1 Right Hand 진행이 막혀 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse의/)).toBeNull();
  });

  it("renders the owned blocked summary as a text node instead of template syntax", () => {
    const song = songWithBlocked();
    song.collaboration!.assignments[0]!.summary = "Lock {assignee} at {at} in {section}";
    render(<FirstBlockedCallout song={song} />);
    expect(screen.getByText("Lock {assignee} at {at} in {section}")).toBeTruthy();
    expect(screen.queryByText("Lock Keys at 0:10 in verse")).toBeNull();
  });
});
