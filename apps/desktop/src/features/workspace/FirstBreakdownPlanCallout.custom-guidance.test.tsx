import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstBreakdownPlanCallout } from "./FirstBreakdownPlanCallout";

const mountedTargets = new Set<HTMLElement>();

function songWithCustomBreakdownPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const chorus = structuredClone(verse);
  chorus.id = "chorus-custom-breakdown";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  const bass = chorus.roles.find((role) => role.id === "bass-guitar")!;
  bass.breakdownPlan = "Mute for four bars.";
  bass.breakdownPlanSource = "user";
  chorus.partGraph = chorus.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === "bass-guitar"
  }));
  song.sections = [verse, chorus];
  return song;
}

function appendSongStructureTarget() {
  const timeline = document.createElement("div");
  const grid = document.createElement("div");
  grid.dataset.testid = "song-structure-grid";
  const target = document.createElement("div");
  target.dataset.sectionIndex = "1";
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
  grid.appendChild(target);
  timeline.appendChild(grid);
  document.body.appendChild(timeline);
  mountedTargets.add(timeline);
}

describe("FirstBreakdownPlanCallout custom guidance", () => {
  afterEach(() => {
    for (const target of mountedTargets) {
      target.remove();
    }
    mountedTargets.clear();
    vi.unstubAllGlobals();
  });

  it("does not replace user-owned guidance with model-specific sparse instructions after Open", () => {
    appendSongStructureTarget();
    render(<FirstBreakdownPlanCallout song={songWithCustomBreakdownPlan()} />);

    expect(screen.getByText("Bass Guitar holds the chorus breakdown at 0:30.")).toBeTruthy();
    expect(screen.getByText("Mute for four bars.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar breakdown at 0:30" }));

    expect(screen.getByText("Bass Guitar holds the chorus breakdown at 0:30.")).toBeTruthy();
    expect(screen.getByText("Mute for four bars.")).toBeTruthy();
    expect(screen.queryByText(/Keep Bass Guitar sparse at 0:30 until the drop\./)).toBeNull();
  });
});
