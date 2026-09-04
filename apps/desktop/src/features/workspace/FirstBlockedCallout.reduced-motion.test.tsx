import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstBlockedCallout } from "./FirstBlockedCallout";

describe("FirstBlockedCallout reduced motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrolls immediately when the operating system requests reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));

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

    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", "Scrollable song structure timeline");
    const target = document.createElement("div");
    target.dataset.sectionIndex = "0";
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstBlockedCallout song={song} />);
    fireEvent.click(screen.getByRole("button", { name: "Open verse blocker at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });

    grid.remove();
  });
});
