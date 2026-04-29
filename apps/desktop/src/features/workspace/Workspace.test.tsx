import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

describe("Workspace", () => {
  it("keeps the song-structure grid valid when a project has no sections", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];

    render(<Workspace song={song} />);

    const timelineRegion = screen.getByRole("region", { name: /scrollable song structure timeline/i });
    const grid = timelineRegion.querySelector(".grid") as HTMLElement | null;

    expect(grid?.style.gridTemplateColumns).not.toContain("repeat(0");
    expect(grid?.style.gridTemplateColumns).toContain("repeat(1");
  });
});
