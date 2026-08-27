import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstBreakdownPlanCallout } from "./FirstBreakdownPlanCallout";

function songWithBreakdownPlan(id: string) {
  const song = createDemoRehearsalSong();
  song.id = id;
  const verse = song.sections[0]!;
  const chorus = structuredClone(verse);
  chorus.id = `${id}-chorus`;
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  const bass = chorus.roles.find((role) => role.id === "bass-guitar")!;
  bass.breakdownPlan = "Hold this breakdown; keep it sparse until the drop.";
  chorus.partGraph = chorus.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === "bass-guitar"
  }));
  song.sections = [verse, chorus];
  return song;
}

describe("FirstBreakdownPlanCallout workspace scope", () => {
  it("opens the song-structure renderer owned by the current workspace", () => {
    const firstSong = songWithBreakdownPlan("first-workspace-song");
    const secondSong = songWithBreakdownPlan("second-workspace-song");

    const { container } = render(
      <>
        <div data-testid="workspace-one">
          <FirstBreakdownPlanCallout song={firstSong} />
          <div data-testid="song-structure-grid">
            <div data-section-index="1" />
          </div>
        </div>
        <div data-testid="workspace-two">
          <FirstBreakdownPlanCallout song={secondSong} />
          <div data-testid="song-structure-grid">
            <div data-section-index="1" />
          </div>
        </div>
      </>
    );

    const targets = container.querySelectorAll<HTMLElement>('[data-section-index="1"]');
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

    const actions = screen.getAllByRole("button", {
      name: "Open Bass Guitar breakdown at 0:30"
    });
    expect(actions).toHaveLength(2);
    fireEvent.click(actions[1]!);

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
  });
});
