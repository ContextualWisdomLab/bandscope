import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstGrooveCallout } from "./FirstGrooveCallout";

describe("FirstGrooveCallout reduced motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrolls immediately when the operating system requests reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));

    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", "Scrollable song structure timeline");
    const target = document.createElement("div");
    target.dataset.sectionIndex = "0";
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstGrooveCallout song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar groove at 0:10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });

    grid.remove();
  });
});
