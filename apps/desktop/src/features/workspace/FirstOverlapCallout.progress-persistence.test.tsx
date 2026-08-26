import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstOverlapCallout } from "./FirstOverlapCallout";

let mountedTimeline: HTMLElement | null = null;

function appendSongStructureTarget(): void {
  const timeline = document.createElement("div");
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const target = document.createElement("div");
  target.dataset.sectionIndex = "0";
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
  grid.appendChild(target);
  timeline.appendChild(grid);
  document.body.appendChild(timeline);
  mountedTimeline = timeline;
}

function withPracticeProgress(song: RehearsalSong, progress: number): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section, sectionIndex) =>
      sectionIndex === 0
        ? {
            ...section,
            roles: section.roles.map((role, roleIndex) =>
              roleIndex === 0 ? { ...role, practiceProgress: progress } : role
            )
          }
        : section
    )
  };
}

describe("FirstOverlapCallout immutable song updates", () => {
  afterEach(() => {
    mountedTimeline?.remove();
    mountedTimeline = null;
  });

  it("keeps the opened overlap action armed after unrelated practice progress changes", () => {
    const song = createDemoRehearsalSong();
    appendSongStructureTarget();
    const { rerender } = render(<FirstOverlapCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar overlap at 0:10" }));
    expect(
      screen.getByText(/Clear the overlap with Bass Guitar at 0:10. Make room for each other./)
    ).toBeTruthy();

    rerender(<FirstOverlapCallout song={withPracticeProgress(song, 42)} />);

    expect(
      screen.getByText(/Clear the overlap with Bass Guitar at 0:10. Make room for each other./)
    ).toBeTruthy();
    expect(screen.queryByText("Bass Guitar overlaps in the verse at 0:10.")).toBeNull();
  });
});
