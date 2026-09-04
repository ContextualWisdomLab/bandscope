import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstFadePlanCallout } from "./FirstFadePlanCallout";

const appendedSongStructureTargets = new Set<HTMLElement>();

function songWithCustomFadePlan(source: "model" | "user" | undefined, text: string) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({ ...node, is_active: true }));
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = chorus.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
  vocal.fadePlan = text;
  if (source) {
    vocal.fadePlanSource = source;
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

describe("FirstFadePlanCallout custom guidance", () => {
  afterEach(() => {
    for (const timeline of appendedSongStructureTargets) {
      timeline.remove();
    }
    appendedSongStructureTargets.clear();
  });

  it("preserves user-authored fade guidance verbatim", () => {
    render(
      <FirstFadePlanCallout
        song={songWithCustomFadePlan("user", "Grow on the snare; don't rush the last eighth.")}
      />
    );
    expect(screen.getByText("Grow on the snare; don't rush the last eighth.")).toBeTruthy();
  });

  it("keeps user-authored guidance in the plain body after opening the fade", () => {
    appendSongStructureTarget();
    render(
      <FirstFadePlanCallout
        song={songWithCustomFadePlan("user", "Grow on the snare; don't rush the last eighth.")}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal fade at 0:30" }));

    expect(screen.getByText("Lead Vocal fades the chorus at 0:30.")).toBeTruthy();
    expect(screen.getByText("Grow on the snare; don't rush the last eighth.")).toBeTruthy();
    expect(screen.queryByText(/Fade Lead Vocal together at 0:30 so the quieter landing is audible./)).toBeNull();
  });

  it("does not render custom copy without provenance", () => {
    render(
      <FirstFadePlanCallout
        song={songWithCustomFadePlan(undefined, "Stack the last bar and grow together.")}
      />
    );
    expect(screen.queryByText("Stack the last bar and grow together.")).toBeNull();
    expect(
      screen.getByText(
        "No fade plan is available. Stay on tonight's map for the next rehearsal cue."
      )
    ).toBeTruthy();
  });
});
