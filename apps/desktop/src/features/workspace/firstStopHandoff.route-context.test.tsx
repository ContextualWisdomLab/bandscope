import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstStopCallout } from "./FirstStopCallout";
import { SectionRoadmap } from "./SectionRoadmap";
import { resolveFirstStopHandoff } from "./firstStopHandoff";

function songWithRouteContext() {
  const song = createDemoRehearsalSong();
  const seed = song.sections[0]!;
  const verse = structuredClone(seed);
  const stop = structuredClone(seed);
  const chorus = structuredClone(seed);

  verse.id = "verse-1";
  verse.label = "verse";
  verse.timeRange = { start: 0, end: 10 };

  stop.id = "stop-1";
  stop.label = "stop";
  stop.timeRange = { start: 10, end: 11 };
  stop.roles = stop.roles.map((role, index) => ({
    ...role,
    id: `stop-role-${index}`,
    name: index === 0 ? "Bass" : role.name
  }));
  stop.partGraph = stop.roles.map((role) => ({
    role_id: role.id,
    is_active: true,
    handoff_to: [],
    handoff_from: []
  }));

  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: 11, end: 24 };
  chorus.roles = chorus.roles.map((role, index) => ({ ...role, id: `chorus-role-${index}` }));

  song.sections = [verse, stop, chorus];
  return song;
}

function songWithTerminalStop() {
  const terminalSong = songWithRouteContext();
  terminalSong.sections = terminalSong.sections.slice(0, 2);
  return terminalSong;
}

describe("first-stop route context succession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the previous and next named form around the validated stop", () => {
    const result = resolveFirstStopHandoff(songWithRouteContext());

    expect(result?.previousSectionLabel).toBe("verse");
    expect(result?.nextSectionLabel).toBe("chorus");
    expect(result?.hasFollowingSection).toBe(true);
  });

  it("distinguishes a terminal stop from an unnamed following section", () => {
    const result = resolveFirstStopHandoff(songWithTerminalStop());

    expect(result?.previousSectionLabel).toBe("verse");
    expect(result?.nextSectionLabel).toBeNull();
    expect(result?.hasFollowingSection).toBe(false);
  });

  it("names the re-entry in the existing actionable stop callout without adding a second static card", () => {
    vi.stubGlobal("navigator", { language: "en-US" });

    render(<FirstStopCallout song={songWithRouteContext()} />);

    expect(screen.getByText("After verse, cut together here. Come back in on chorus.")).toBeTruthy();
    expect(screen.getAllByLabelText("Tonight's first stop")).toHaveLength(1);
  });

  it("omits invented re-entry copy when the validated stop ends the song", () => {
    vi.stubGlobal("navigator", { language: "en-US" });

    render(<FirstStopCallout song={songWithTerminalStop()} />);

    expect(screen.queryByTestId("first-stop-route")).toBeNull();
  });

  it("puts the re-entry action only on the validated stop roadmap card", () => {
    vi.stubGlobal("navigator", { language: "en-US" });

    render(<SectionRoadmap song={songWithRouteContext()} activeRole={null} />);

    expect(screen.getByTestId("first-stop-action-stop-1")).toHaveTextContent(
      "Cut together here, then come back in on chorus."
    );
    expect(screen.queryByTestId("first-stop-action-verse-1")).toBeNull();
    expect(screen.queryByTestId("first-stop-action-chorus-1")).toBeNull();
  });

  it("omits a roadmap re-entry action when the validated stop is terminal", () => {
    vi.stubGlobal("navigator", { language: "en-US" });

    render(<SectionRoadmap song={songWithTerminalStop()} activeRole={null} />);

    expect(screen.queryByTestId("first-stop-action-stop-1")).toBeNull();
  });
});
