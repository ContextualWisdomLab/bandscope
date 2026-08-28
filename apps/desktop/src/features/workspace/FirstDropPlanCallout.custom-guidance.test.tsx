import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstDropPlanCallout } from "./FirstDropPlanCallout";

const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithCustomDropPlan(source: "model" | "user" | undefined, text: string) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === "bass-guitar" || node.role_id === "keys-right"
  }));
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = chorus.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
  vocal.dropPlan = text;
  if (source) {
    vocal.dropPlanSource = source;
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

describe("FirstDropPlanCallout custom guidance", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
  });

  it("preserves user-authored drop guidance verbatim", () => {
    render(
      <FirstDropPlanCallout
        song={songWithCustomDropPlan("user", "Come in on the snare; don't rush the last eighth.")}
      />
    );
    expect(screen.getByText("Come in on the snare; don't rush the last eighth.")).toBeTruthy();
  });

  it("keeps user-authored guidance in the plain body after opening the drop", () => {
    appendSongStructureTarget();
    render(
      <FirstDropPlanCallout
        song={songWithCustomDropPlan("user", "Come in on the snare; don't rush the last eighth.")}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal drop at 0:30" }));

    expect(screen.getByText("Lead Vocal lands the chorus drop at 0:30.")).toBeTruthy();
    expect(screen.getByText("Come in on the snare; don't rush the last eighth.")).toBeTruthy();
    expect(screen.queryByText(/Land Lead Vocal together at 0:30 when the texture fills./)).toBeNull();
  });

  it("does not render custom copy without provenance", () => {
    render(
      <FirstDropPlanCallout
        song={songWithCustomDropPlan(undefined, "Stack the last bar and land together.")}
      />
    );
    expect(screen.queryByText("Stack the last bar and land together.")).toBeNull();
    expect(
      screen.getByText(
        "No drop plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
  });
});
