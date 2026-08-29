import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

describe("Workspace tap-tempo session ownership", () => {
  it("resets session taps when a different tempo-less song replaces a same-id analysis result", () => {
    const firstSong = createDemoRehearsalSong();
    firstSong.tempo = undefined;
    firstSong.title = "First room song";

    const nextSong = createDemoRehearsalSong();
    nextSong.tempo = undefined;
    nextSong.title = "Second room song";
    expect(nextSong.id).toBe(firstSong.id);

    const { rerender } = render(<Workspace song={firstSong} />);
    fireEvent.click(screen.getByRole("button", { name: /tap the groove to set tonight's tempo/i }));
    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-amber-300");

    rerender(<Workspace song={nextSong} />);

    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-white/15");
    expect(screen.getByRole("button", { name: /reset tonight's tap tempo/i })).toBeDisabled();
  });

  it("preserves session taps across an immutable practice-progress update to the same song", () => {
    const song = createDemoRehearsalSong();
    song.tempo = undefined;
    const { rerender } = render(<Workspace song={song} />);

    fireEvent.click(screen.getByRole("button", { name: /tap the groove to set tonight's tempo/i }));
    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-amber-300");

    const progressOnlyUpdate = {
      ...song,
      sections: song.sections.map((section, sectionIndex) => ({
        ...section,
        roles: section.roles.map((role, roleIndex) =>
          sectionIndex === 0 && roleIndex === 0 ? { ...role, practiceProgress: 60 } : role
        )
      }))
    };
    rerender(<Workspace song={progressOnlyUpdate} />);

    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-amber-300");
  });
});
