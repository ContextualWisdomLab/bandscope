import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstPreChorusCallout } from "./FirstPreChorusCallout";

function songWithPreChorus() {
  const song = createDemoRehearsalSong();
  const seed = song.sections[0]!;
  const preChorus = structuredClone(seed);
  preChorus.id = "pre-chorus-1";
  preChorus.label = "pre-chorus";
  preChorus.timeRange = { start: 20, end: 28 };
  preChorus.roles = [
    {
      ...seed.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  preChorus.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [preChorus];
  return song;
}

describe("FirstPreChorusCallout reduced motion", () => {
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
    const target = document.createElement("div");
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstPreChorusCallout song={songWithPreChorus()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal pre-chorus at 0:20" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });

    grid.remove();
  });
});
