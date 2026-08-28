import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstPickupPlanCallout } from "./FirstPickupPlanCallout";

function songWithPickupPlan(id: string) {
  const song = createDemoRehearsalSong();
  song.id = id;
  const verse = song.sections[0]!;
  const intro = structuredClone(verse);
  intro.id = `${id}-intro`;
  intro.label = "intro";
  intro.timeRange = { start: 0, end: verse.timeRange.start };
  intro.roles = intro.roles.map((role) => {
    const clone = { ...role };
    delete clone.pickupPlan;
    delete clone.pickupPlanSource;
    return clone;
  });
  intro.partGraph = intro.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id !== "bass-guitar"
  }));
  song.sections = [intro, verse];
  return song;
}

describe("FirstPickupPlanCallout workspace scope", () => {
  it("opens the song-structure renderer owned by the current workspace", () => {
    const firstSong = songWithPickupPlan("first-workspace-song");
    const secondSong = songWithPickupPlan("second-workspace-song");

    const { container } = render(
      <>
        <div data-testid="workspace-one">
          <FirstPickupPlanCallout song={firstSong} />
          <div data-testid="song-structure-grid">
            <div data-section-index="1" />
          </div>
        </div>
        <div data-testid="workspace-two">
          <FirstPickupPlanCallout song={secondSong} />
          <div data-testid="song-structure-grid">
            <div data-section-index="1" />
          </div>
        </div>
      </>
    );

    const targets = container.querySelectorAll<HTMLElement>('[data-section-index="1"]');
    expect(targets).toHaveLength(2);
    const firstScrollIntoView = vi.fn();
    const secondScrollIntoView = vi.fn();
    Object.defineProperty(targets[0]!, "scrollIntoView", {
      configurable: true,
      value: firstScrollIntoView
    });
    Object.defineProperty(targets[1]!, "scrollIntoView", {
      configurable: true,
      value: secondScrollIntoView
    });

    const actions = screen.getAllByRole("button", {
      name: "Open Bass Guitar pickup at 0:10"
    });
    expect(actions).toHaveLength(2);
    fireEvent.click(actions[1]!);

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
  });

  it("fails closed instead of opening another workspace when its renderer is absent", () => {
    const song = songWithPickupPlan("renderer-absent-song");
    const foreignScrollIntoView = vi.fn();

    const { container } = render(
      <>
        <div data-testid="workspace-without-renderer">
          <FirstPickupPlanCallout song={song} />
        </div>
        <div data-testid="foreign-workspace">
          <div data-testid="song-structure-grid">
            <div data-section-index="1" />
          </div>
        </div>
      </>
    );

    const foreignTarget = container.querySelector<HTMLElement>('[data-section-index="1"]');
    expect(foreignTarget).not.toBeNull();
    Object.defineProperty(foreignTarget!, "scrollIntoView", {
      configurable: true,
      value: foreignScrollIntoView
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Bass Guitar pickup at 0:10"
      })
    );

    expect(foreignScrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
