import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstSwellPlanCallout } from "./FirstSwellPlanCallout";

const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithCustomSwellPlan(source: "model" | "user" | undefined, text: string) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({ ...node, is_active: true }));
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = chorus.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
  vocal.swellPlan = text;
  if (source) {
    vocal.swellPlanSource = source;
  }
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
  appendedSongStructureTargets.add(timeline);
}

describe("FirstSwellPlanCallout custom guidance", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
  });

  it("preserves user-authored swell guidance verbatim", () => {
    render(
      <FirstSwellPlanCallout
        song={songWithCustomSwellPlan("user", "Grow on the snare; don't rush the last eighth.")}
      />
    );
    expect(screen.getByText("Grow on the snare; don't rush the last eighth.")).toBeTruthy();
  });

  it("keeps user-authored guidance in the plain body after opening the swell", () => {
    appendSongStructureTarget();
    render(
      <FirstSwellPlanCallout
        song={songWithCustomSwellPlan("user", "Grow on the snare; don't rush the last eighth.")}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal swell at 0:30" }));

    expect(screen.getByText("Lead Vocal swells the chorus at 0:30.")).toBeTruthy();
    expect(screen.getByText("Grow on the snare; don't rush the last eighth.")).toBeTruthy();
    expect(screen.queryByText(/Swell Lead Vocal together at 0:30 so the lift is audible./)).toBeNull();
  });

  it("fails closed for custom copy without provenance", () => {
    render(
      <FirstSwellPlanCallout
        song={songWithCustomSwellPlan(undefined, "Stack the last bar and grow together.")}
      />
    );
    expect(
      screen.getByText(
        "No swell plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Stack the last bar and grow together.")).toBeNull();
  });
});
