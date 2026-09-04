import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstEntranceCallout } from "./FirstEntranceCallout";

afterEach(() => {
  vi.unstubAllGlobals();
  document.querySelector("#workspace-song-structure-grid")?.remove();
});

/** Mount the renderer-owned song-structure target used by workspace navigation. */
function appendSongStructureTarget() {
  const grid = document.createElement("div");
  grid.id = "workspace-song-structure-grid";
  const target = document.createElement("div");
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  grid.appendChild(target);
  document.body.appendChild(grid);
  return scrollIntoView;
}

describe("FirstEntranceCallout reduced-motion navigation", () => {
  it("avoids smooth scrolling when the user requests reduced motion", () => {
    const scrollIntoView = appendSongStructureTarget();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    );

    render(<FirstEntranceCallout song={createDemoRehearsalSong()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open Bass Guitar entrance in the verse at 0:10" })
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "auto"
    });
  });
});
