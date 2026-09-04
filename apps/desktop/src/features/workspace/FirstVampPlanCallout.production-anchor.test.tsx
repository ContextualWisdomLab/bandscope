import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstVampPlanCallout } from "./FirstVampPlanCallout";

const SONG_STRUCTURE_GRID_ID = "workspace-song-structure-grid";

describe("FirstVampPlanCallout production navigation anchor", () => {
  afterEach(() => {
    document.getElementById(SONG_STRUCTURE_GRID_ID)?.remove();
  });

  it("opens the rendered vamp through the shared production grid id without a test-only attribute", () => {
    const grid = document.createElement("div");
    grid.id = SONG_STRUCTURE_GRID_ID;
    const target = document.createElement("div");
    target.dataset.sectionIndex = "0";
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstVampPlanCallout song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar vamp at 0:10" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });
});
