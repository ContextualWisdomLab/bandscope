import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPickupCallout } from "./FirstPickupCallout";

describe("FirstPickupCallout reduced motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrolls immediately when the operating system requests reduced motion", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", matchMedia);

    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    const target = document.createElement("div");
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstPickupCallout song={createDemoRehearsalSong()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Lead Vocal pickup from Bass Guitar at 0:30"
      })
    );

    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
    grid.remove();
  });
});
