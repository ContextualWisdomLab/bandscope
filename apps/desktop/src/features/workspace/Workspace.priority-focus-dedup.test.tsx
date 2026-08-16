import { render, screen, within } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
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
    const song = createDemoRehearsalSong();
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
    expect(within(priorities).getAllByText(/^verse$/i)).toHaveLength(1);
    expect(within(priorities).getByText("bridge")).toBeTruthy();
    expect(within(priorities).getByText("chorus")).toBeTruthy();
  });
});
