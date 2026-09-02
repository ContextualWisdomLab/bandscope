import { fireEvent, render } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

describe("Workspace loop roadmap synchronization", () => {
  it("projects the player-selected section onto the production roadmap", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    song.sections = [verse, chorus];

    render(<Workspace song={song} />);

    const sectionButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'button[id^="rehearsal-loop-section-"]',
      ),
    );
    const verseCard = document.getElementById("workspace-section-card-0");
    const chorusCard = document.getElementById("workspace-section-card-1");

    expect(sectionButtons).toHaveLength(2);
    expect(verseCard?.className).toContain("ring-cyan-300/70");
    expect(chorusCard?.className).not.toContain("ring-cyan-300/70");

    fireEvent.click(sectionButtons[1]!);

    expect(verseCard?.className).not.toContain("ring-cyan-300/70");
    expect(chorusCard?.className).toContain("ring-cyan-300/70");
  });
});
