import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstTagCallout } from "./FirstTagCallout";

function songWithTag() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const tag = structuredClone(verse);
  tag.id = "tag-1";
  tag.label = "tag";
  tag.timeRange = { start: 200, end: 208 };
  tag.roles = [
    {
      ...verse.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  tag.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, tag];
  return song;
}

describe("FirstTagCallout reduced motion", () => {
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

    render(<FirstTagCallout song={songWithTag()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal tag at 3:20" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });

    grid.remove();
  });
});
