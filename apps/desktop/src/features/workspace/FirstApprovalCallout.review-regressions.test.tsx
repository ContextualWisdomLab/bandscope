import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstApprovalCallout } from "./FirstApprovalCallout";
import { resolveFirstApproval } from "./firstApproval";
import { Workspace } from "./Workspace";

describe("FirstApprovalCallout current review regressions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the real song-structure cell rendered by Workspace", () => {
    const song = createDemoRehearsalSong();
    render(<Workspace song={song} />);
    const renderer = screen.getByTestId("song-structure-grid");
    const firstCell = renderer.children.item(0) as HTMLElement | null;
    expect(firstCell).not.toBeNull();
    const scrollIntoView = vi.fn();
    Object.defineProperty(firstCell!, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    fireEvent.click(screen.getByRole("button", { name: "Open verse approval at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("keeps scopes naming multiple canonical form labels band-wide", () => {
    const song = createDemoRehearsalSong();
    song.sections = [song.sections[0]!];
    song.collaboration!.approvals[0]!.scope = "Verse / Chorus transition";

    const approval = resolveFirstApproval(song);

    expect(approval).not.toBeNull();
    expect(approval?.section).toBeNull();
    expect(approval?.atSeconds).toBeNull();
  });

  it("keeps the pending owner and scope visible after opening the approval", () => {
    const song = createDemoRehearsalSong();
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

    render(<FirstApprovalCallout song={song} />);
    fireEvent.click(screen.getByRole("button", { name: "Open verse approval at 0:10" }));

    expect(screen.getByText(/MD still needs to sign off on Verse harmony pass/i)).toBeTruthy();
    expect(screen.getByText(/Keep the verse approval moving at 0:10/i)).toBeTruthy();
    grid.remove();
  });
});
