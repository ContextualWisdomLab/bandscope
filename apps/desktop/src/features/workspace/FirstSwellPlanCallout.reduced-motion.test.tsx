import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstSwellPlanCallout } from "./FirstSwellPlanCallout";

const DEMO_SWELL_PLAN = "Swell this part; grow into the next downbeat.";

function songWithSwellPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({ ...node, is_active: true }));
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = chorus.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
  vocal.swellPlan = DEMO_SWELL_PLAN;
  vocal.swellPlanSource = "model";
  song.sections = [verse, chorus];
  return song;
}

describe("FirstSwellPlanCallout reduced motion", () => {
  afterEach(() => {
    document.querySelectorAll('[data-testid="song-structure-grid"]').forEach((node) => {
      node.parentElement?.remove();
    });
    vi.unstubAllGlobals();
  });

  it("uses immediate scrolling when the operating system requests reduced motion", () => {
    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    const target = document.createElement("div");
    target.dataset.sectionIndex = "1";
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", { configurable: true, value: scrollIntoView });
    grid.appendChild(target);
    document.body.appendChild(grid);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));

    render(<FirstSwellPlanCallout song={songWithSwellPlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal swell at 0:30" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
  });
});
