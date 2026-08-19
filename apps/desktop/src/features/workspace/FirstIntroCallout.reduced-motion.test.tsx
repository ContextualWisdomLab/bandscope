import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstIntroCallout } from "./FirstIntroCallout";

function songWithIntro() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const intro = structuredClone(verse);
  intro.id = "intro-1";
  intro.label = "intro";
  intro.timeRange = { start: 0, end: 8 };
  intro.roles = [
    {
      ...verse.roles[0]!,
      id: "drums",
      name: "Drums",
      rehearsalPriority: "high"
    }
  ];
  intro.partGraph = [
    {
      role_id: "drums",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [intro, verse];
  return song;
}

describe("FirstIntroCallout reduced motion", () => {
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
    const second = document.createElement("div");
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    grid.appendChild(target);
    grid.appendChild(second);
    document.body.appendChild(grid);

    render(<FirstIntroCallout song={songWithIntro()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Drums intro at 0:00" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });

    grid.remove();
  });
});
