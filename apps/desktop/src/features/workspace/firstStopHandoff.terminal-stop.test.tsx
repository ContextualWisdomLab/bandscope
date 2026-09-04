import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstStopCallout } from "./FirstStopCallout";
import { SectionRoadmap } from "./SectionRoadmap";

function songWithTerminalStop() {
  const song = createDemoRehearsalSong();
  const verse = structuredClone(song.sections[0]!);
  const stop = structuredClone(song.sections[0]!);

  verse.id = "verse-1";
  verse.label = "verse";
  verse.timeRange = { start: 0, end: 18 };

  stop.id = "stop-final";
  stop.label = "stop";
  stop.timeRange = { start: 18, end: 19 };
  stop.roles = stop.roles.map((role, index) => ({
    ...role,
    id: `terminal-role-${index}`
  }));
  stop.partGraph = stop.roles.map((role) => ({
    role_id: role.id,
    is_active: true,
    handoff_to: [],
    handoff_from: []
  }));

  song.sections = [verse, stop];
  return song;
}

describe("terminal first-stop guidance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not invent a re-entry after the final stop in the callout", () => {
    vi.stubGlobal("navigator", { language: "en-US" });

    render(<FirstStopCallout song={songWithTerminalStop()} />);

    expect(screen.getByText("After verse, cut together here. Hold the cut.")).toBeTruthy();
    expect(screen.queryByText(/downbeat/i)).toBeNull();
  });

  it("keeps the terminal roadmap action free of a nonexistent re-entry", () => {
    vi.stubGlobal("navigator", { language: "en-US" });

    render(<SectionRoadmap song={songWithTerminalStop()} activeRole={null} />);

    expect(screen.getByTestId("first-stop-action-stop-final")).toHaveTextContent(
      "Cut together here. Hold the cut."
    );
    expect(screen.queryByText(/come back in/i)).toBeNull();
  });
});
