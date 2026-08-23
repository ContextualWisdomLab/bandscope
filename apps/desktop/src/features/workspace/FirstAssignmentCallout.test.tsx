import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstAssignmentCallout } from "./FirstAssignmentCallout";

function songWithAssignment() {
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

describe("FirstAssignmentCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstAssignmentCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No assignment yet. Stay on tonight's map until a part has a job.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithAssignment();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstAssignmentCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open Bass Guitar assignment at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same assignment signature", () => {
    const firstSong = songWithAssignment();
    const nextSong = songWithAssignment();
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
    const { rerender } = render(<FirstAssignmentCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar assignment at 0:10" }));
    expect(screen.getByText(/Keep the Bass Guitar assignment moving at 0:10. Lock it in together./)).toBeTruthy();

    rerender(<FirstAssignmentCallout song={nextSong} />);

    expect(screen.getByText("Rhythm Section holds Bass Guitar in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Keep the Bass Guitar assignment moving at 0:10. Lock it in together./)).toBeNull();

    grid.remove();
  });

  it("names the first assignment as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstAssignmentCallout song={songWithAssignment()} />);

    expect(screen.getByText("Lock the bass entrance against the pickup so the chorus lift lands together.")).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open Bass Guitar assignment at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Keep the Bass Guitar assignment moving at 0:10. Lock it in together./)).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstAssignmentCallout song={songWithAssignment()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar assignment at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Keep the Bass Guitar assignment moving at 0:10. Lock it in together./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstAssignmentCallout song={songWithAssignment()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar assignment at 0:10" }));

    expect(screen.getByText("Rhythm Section holds Bass Guitar in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Keep the Bass Guitar assignment moving at 0:10. Lock it in together./)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithAssignment();
    song.sections[0]!.id = "analysis section / duplicate";
    song.collaboration!.assignments[0]!.sectionId = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstAssignmentCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar assignment at 0:10" }));
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

    render(<FirstAssignmentCallout song={songWithAssignment()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar assignment at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first assignment changes or returns later", () => {
    const initialSong = songWithAssignment();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstAssignmentCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar assignment at 0:10" }));
    expect(screen.getByText(/Keep the Bass Guitar assignment moving at 0:10. Lock it in together./)).toBeTruthy();

    const nextSong = songWithAssignment();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstAssignmentCallout song={nextSong} />);
    expect(screen.getByText("Rhythm Section holds Bass Guitar in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable assignment guidance-only", () => {
    const song = songWithAssignment();
    song.collaboration = undefined;
    render(<FirstAssignmentCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No assignment yet. Stay on tonight's map until a part has a job.")
    ).toBeTruthy();
  });

  it("names a band-wide assignment when no part carries it", () => {
    const song = songWithAssignment();
    for (const node of song.sections[0]!.partGraph) {
      node.is_active = false;
    }
    const { grid, scrollIntoView } = appendSongStructureTarget();
    render(<FirstAssignmentCallout song={song} />);
    const action = screen.getByRole("button", { name: "Open the first assignment at 0:10" });
    expect(screen.getByText("Rhythm Section holds the verse assignment at 0:10.")).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText("Keep the assignment moving at 0:10. Lock it in together.")).toBeTruthy();
    grid.remove();
  });

  it("localizes the assignment form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithAssignment();
    song.sections[0]!.roles[0]!.name = "베이스 기타";

    render(<FirstAssignmentCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 베이스 기타 파트 담당은 Rhythm Section입니다.")).toBeTruthy();
    expect(screen.queryByText(/verse에서/)).toBeNull();
  });

  it("renders the owned assignment summary as a text node instead of template syntax", () => {
    const song = songWithAssignment();
    song.collaboration!.assignments[0]!.summary = "Lock {role} at {at} with {assignee}";
    song.collaboration!.assignments[1]!.status = "ready";
    render(<FirstAssignmentCallout song={song} />);
    expect(screen.getByText("Lock {role} at {at} with {assignee}")).toBeTruthy();
    expect(screen.queryByText("Lock Bass Guitar at 0:10 with Rhythm Section")).toBeNull();
  });
});
