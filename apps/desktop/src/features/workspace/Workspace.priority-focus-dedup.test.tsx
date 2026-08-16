import { render, screen, within } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string): void {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("Workspace rehearsal-priority focus fallback", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("deduplicates normalized focus labels while preserving first-occurrence order", () => {
    setNavigatorLanguage("en-US");
    const song = createLateNightSetWithChorus();
    for (const section of song.sections) {
      for (const role of section.roles) {
        role.rehearsalPriority = "low";
      }
    }
    song.exportSummary = {
      ...song.exportSummary,
      focusSections: [" verse ", "verse", "VERSE", "bridge", "chorus"]
    };

    render(<Workspace song={song} />);

    const priorities = screen.getByRole("region", { name: "Rehearsal Priorities" });
    const buttons = within(priorities).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["verse", "chorus"]);
    expect(within(priorities).queryByText("bridge")).toBeNull();
  });
});

/**
 * Build a Late Night Set with verse and chorus so unmatched bridge labels can
 * be dropped while still proving first-occurrence order for real sections.
 */
function createLateNightSetWithChorus(): RehearsalSong {
  const song = createDemoRehearsalSong();
  const chorus = structuredClone(song.sections[0]!);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: 30, end: 50 };
  song.sections = [song.sections[0]!, chorus];
  return song;
}
