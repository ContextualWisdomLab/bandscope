import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstBlockedCallout } from "./FirstBlockedCallout";

function blockedSong(id: string) {
  const song = createDemoRehearsalSong();
  song.id = id;
  const section = structuredClone(song.sections[0]!);
  section.id = `${id}-blocked-section`;
  song.sections = [section];
  song.collaboration = {
    syncMode: "local_only",
    syncNote: "Keep blocked jobs local for now.",
    assignments: [
      {
        id: `${id}-blocked-assignment`,
        assignee: "Keys",
        summary: "Wait on the in-ear mix before the verse color pass.",
        sectionId: section.id,
        roleId: "keys-right",
        status: "blocked"
      }
    ],
    comments: [],
    approvals: []
  };
  return song;
}

describe("FirstBlockedCallout workspace scope", () => {
  it("opens the song-structure renderer owned by the current workspace", () => {
    const { container } = render(
      <>
        <div data-testid="workspace-one">
          <FirstBlockedCallout song={blockedSong("first-workspace-song")} />
          <div data-testid="song-structure-grid">
            <div data-section-index="0" />
          </div>
        </div>
        <div data-testid="workspace-two">
          <FirstBlockedCallout song={blockedSong("second-workspace-song")} />
          <div data-testid="song-structure-grid">
            <div data-section-index="0" />
          </div>
        </div>
      </>
    );

    const targets = container.querySelectorAll<HTMLElement>('[data-section-index="0"]');
    expect(targets).toHaveLength(2);
    const firstScrollIntoView = vi.fn();
    const secondScrollIntoView = vi.fn();
    Object.defineProperty(targets[0]!, "scrollIntoView", {
      configurable: true,
      value: firstScrollIntoView
    });
    Object.defineProperty(targets[1]!, "scrollIntoView", {
      configurable: true,
      value: secondScrollIntoView
    });

    const actions = screen.getAllByRole("button", { name: "Open verse blocker at 0:10" });
    expect(actions).toHaveLength(2);
    fireEvent.click(actions[1]!);

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
  });
});
