import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstApprovalCallout } from "./FirstApprovalCallout";

function songWithApproval() {
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

describe("FirstApprovalCallout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstApprovalCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No pending approval yet. Stay on tonight's map until a scope needs a sign-off.")
    ).toBeTruthy();
  });

  it("contains a hostile song identity accessor instead of crashing the callout", () => {
    const song = songWithApproval();
    Object.defineProperty(song, "id", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile song id getter");
      }
    });

    expect(() => render(<FirstApprovalCallout song={song} />)).not.toThrow();
    expect(screen.getByRole("button", { name: "Open verse approval at 0:10" })).toBeTruthy();
  });

  it("resets armed guidance when accessor-id songs change with the same approval signature", () => {
    const firstSong = songWithApproval();
    const nextSong = songWithApproval();
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
    const { rerender } = render(<FirstApprovalCallout song={firstSong} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse approval at 0:10" }));
    expect(screen.getByText(/Keep the verse approval moving at 0:10. Sign it off together./)).toBeTruthy();

    rerender(<FirstApprovalCallout song={nextSong} />);

    expect(screen.getByText("MD still needs to sign off on Verse harmony pass in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Keep the verse approval moving at 0:10. Sign it off together./)).toBeNull();

    grid.remove();
  });

  it("names the first approval as map navigation, scrolls to its rendered section, and arms that action", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstApprovalCallout song={songWithApproval()} />);

    expect(screen.getByText("MD still needs to sign off on Verse harmony pass in the verse at 0:10.")).toBeTruthy();
    const action = screen.getByRole("button", {
      name: "Open verse approval at 0:10"
    });
    expect(action).toBeTruthy();
    fireEvent.click(action);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Keep the verse approval moving at 0:10. Sign it off together./)).toBeTruthy();

    grid.remove();
  });

  it("keeps map navigation stable when the renderer accessible name is localized", () => {
    const { grid, scrollIntoView } = appendSongStructureTarget("스크롤 가능한 곡 구조 타임라인");

    render(<FirstApprovalCallout song={songWithApproval()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse approval at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByText(/Keep the verse approval moving at 0:10. Sign it off together./)).toBeTruthy();

    grid.remove();
  });

  it("does not claim map navigation completed when the rendered section target is missing", () => {
    render(<FirstApprovalCallout song={songWithApproval()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse approval at 0:10" }));

    expect(screen.getByText("MD still needs to sign off on Verse harmony pass in the verse at 0:10.")).toBeTruthy();
    expect(screen.queryByText(/Keep the verse approval moving at 0:10. Sign it off together./)).toBeNull();
  });

  it("navigates by renderer-owned section position instead of untrusted analysis ids", () => {
    const song = songWithApproval();
    song.sections[0]!.id = "analysis section / duplicate";
    const { grid, scrollIntoView } = appendSongStructureTarget();

    render(<FirstApprovalCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse approval at 0:10" }));
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

    render(<FirstApprovalCallout song={songWithApproval()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open verse approval at 0:10" }));

    expect(decoyScrollIntoView).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    decoy.remove();
    grid.remove();
  });

  it("shows fresh guidance when the first approval changes or returns later", () => {
    const initialSong = songWithApproval();
    const { grid } = appendSongStructureTarget();
    const { rerender } = render(<FirstApprovalCallout song={initialSong} />);
    fireEvent.click(screen.getByRole("button", { name: "Open verse approval at 0:10" }));
    expect(screen.getByText(/Keep the verse approval moving at 0:10. Sign it off together./)).toBeTruthy();

    const nextSong = songWithApproval();
    nextSong.id = "next-song";
    nextSong.sections[0]!.timeRange = { start: 20, end: 40 };
    rerender(<FirstApprovalCallout song={nextSong} />);
    expect(screen.getByText("MD still needs to sign off on Verse harmony pass in the verse at 0:20.")).toBeTruthy();

    grid.remove();
  });

  it("keeps an unavailable approval guidance-only", () => {
    const song = songWithApproval();
    song.collaboration = undefined;
    render(<FirstApprovalCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("No pending approval yet. Stay on tonight's map until a scope needs a sign-off.")
    ).toBeTruthy();
  });

  it("names a band-wide approval when the scope does not uniquely name a section", () => {
    const song = songWithApproval();
    song.collaboration!.approvals[0]!.scope = "Whole-set mix pass";
    render(<FirstApprovalCallout song={song} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("MD still needs to sign off on Whole-set mix pass.")).toBeTruthy();
  });

  it("names a changes-requested approval as the next pass", () => {
    const song = songWithApproval();
    song.collaboration!.approvals[0]!.status = "changes_requested";
    render(<FirstApprovalCallout song={song} />);
    expect(screen.getByText("MD asked for another pass on Verse harmony pass in the verse at 0:10.")).toBeTruthy();
  });

  it("localizes the approval form label instead of exposing its raw enum in Korean copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = songWithApproval();

    render(<FirstApprovalCallout song={song} />);

    expect(screen.getByText("MD님이 0:10 벌스의 Verse harmony pass 승인을 기다리고 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/verse의/)).toBeNull();
  });

  it("renders the owned approval scope as a text node instead of template syntax", () => {
    const song = songWithApproval();
    song.collaboration!.approvals[0]!.scope = "Lock {owner} at {at} in {section}";
    song.collaboration!.approvals[1]!.status = "approved";
    render(<FirstApprovalCallout song={song} />);
    expect(screen.getByText("MD still needs to sign off on Lock {owner} at {at} in {section}.")).toBeTruthy();
    expect(screen.queryByText("MD still needs to sign off on Lock MD at 0:10 in verse.")).toBeNull();
  });
});
