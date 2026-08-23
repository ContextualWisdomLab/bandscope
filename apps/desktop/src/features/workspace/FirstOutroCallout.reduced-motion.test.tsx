import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstOutroCallout } from "./FirstOutroCallout";

function songWithOutro() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const outro = structuredClone(verse);
  outro.id = "outro-1";
  outro.label = "outro";
  outro.timeRange = { start: 180, end: 196 };
  outro.roles = [
    {
      ...verse.roles[0]!,
      id: "drums",
      name: "Drums",
      rehearsalPriority: "high"
    }
  ];
  outro.partGraph = [
    {
      role_id: "drums",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, outro];
  return song;
}

describe("FirstOutroCallout reduced motion", () => {
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
    const first = document.createElement("div");
    first.dataset.sectionIndex = "0";
    const target = document.createElement("div");
    target.dataset.sectionIndex = "1";
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    grid.appendChild(first);
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstOutroCallout song={songWithOutro()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Drums outro at 3:00" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });

    grid.remove();
  });
});
