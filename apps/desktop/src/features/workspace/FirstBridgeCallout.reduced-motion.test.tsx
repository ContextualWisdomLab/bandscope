import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstBridgeCallout } from "./FirstBridgeCallout";

function songWithBridge() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const bridge = structuredClone(verse);
  bridge.id = "bridge-1";
  bridge.label = "bridge";
  bridge.timeRange = { start: 30, end: 46 };
  bridge.roles = [
    {
      ...verse.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high"
    }
  ];
  bridge.partGraph = [
    {
      role_id: "lead-vocal",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, bridge];
  return song;
}

describe("FirstBridgeCallout reduced motion", () => {
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
    const target = document.createElement("div");
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    grid.appendChild(first);
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstBridgeCallout song={songWithBridge()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal bridge at 0:30" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });

    grid.remove();
  });
});
