import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstStopCallout } from "./FirstStopCallout";

function songWithStop() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const stop = structuredClone(verse);
  stop.id = "stop-1";
  stop.label = "stop";
  stop.timeRange = { start: 18, end: 19 };
  stop.roles = [
    {
      ...verse.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  stop.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, stop];
  return song;
}

describe("FirstStopCallout reduced motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrolls immediately when the operating system requests reduced motion", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", matchMedia);

    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    const first = document.createElement("div");
    const target = document.createElement("div");
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    grid.appendChild(first);
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstStopCallout song={songWithStop()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal stop at 0:18" }));

    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
    grid.remove();
  });
});
