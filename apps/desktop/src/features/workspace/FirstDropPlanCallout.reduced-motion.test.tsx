import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstDropPlanCallout } from "./FirstDropPlanCallout";

const DEMO_DROP_PLAN = "Hit this drop; come in together when the texture fills.";

function songWithDropPlan() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  verse.partGraph = verse.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === "bass-guitar" || node.role_id === "keys-right"
  }));
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  chorus.partGraph = chorus.partGraph.map((node) => ({ ...node, is_active: true }));
  const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
  vocal.dropPlan = DEMO_DROP_PLAN;
  vocal.dropPlanSource = "model";
  song.sections = [verse, chorus];
  return song;
}

describe("FirstDropPlanCallout reduced motion", () => {
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

    render(<FirstDropPlanCallout song={songWithDropPlan()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Lead Vocal drop at 0:30" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
  });
});
