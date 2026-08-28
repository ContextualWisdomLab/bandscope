import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstTranspositionPlanCallout } from "./FirstTranspositionPlanCallout";

describe("FirstTranspositionPlanCallout workspace scope", () => {
  it("opens the song-structure renderer owned by the current workspace", () => {
    const firstSong = createDemoRehearsalSong();
    const secondSong = createDemoRehearsalSong();
    secondSong.id = "second-workspace-song";

    const { container } = render(
      <>
        <div data-testid="workspace-one">
          <FirstTranspositionPlanCallout song={firstSong} />
          <div id="workspace-song-structure-grid">
            <div data-section-index="0" />
          </div>
        </div>
        <div data-testid="workspace-two">
          <FirstTranspositionPlanCallout song={secondSong} />
          <div id="workspace-song-structure-grid">
            <div data-section-index="0" />
          </div>
        </div>
      </>
    );

    const callouts = screen.getAllByRole("complementary", {
      name: "Tonight's first transpose plan"
    });
    expect(callouts).toHaveLength(2);
    expect(callouts.every((callout) => callout.id.length > 0)).toBe(true);
    expect(new Set(callouts.map((callout) => callout.id)).size).toBe(callouts.length);

    const targets = container.querySelectorAll<HTMLElement>('[data-section-index="0"]');
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
      name: "Open Bass Guitar transpose at 0:10"
    });
    expect(actions).toHaveLength(2);
    fireEvent.click(actions[1]!);

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
  });

  it("preserves the opened action when the same named section moves to a new renderer index", () => {
    const song = createDemoRehearsalSong();
    const namedSection = song.sections[0]!;
    const { container, rerender } = render(
      <div>
        <FirstTranspositionPlanCallout song={song} />
        <div id="workspace-song-structure-grid">
          <div data-section-index="0" />
        </div>
      </div>
    );
    const firstTarget = container.querySelector<HTMLElement>('[data-section-index="0"]')!;
    Object.defineProperty(firstTarget, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transpose at 0:10" }));
    expect(
      screen.getByText(/Lock that transpose on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();

    const precedingSection = {
      ...namedSection,
      id: "count-in-section",
      label: "intro" as const,
      timeRange: { start: 0, end: 5 },
      roles: namedSection.roles.map((role) => ({ ...role, transpositionPlan: "" }))
    };
    rerender(
      <div>
        <FirstTranspositionPlanCallout
          song={{ ...song, sections: [precedingSection, namedSection] }}
        />
        <div id="workspace-song-structure-grid">
          <div data-section-index="0" />
          <div data-section-index="1" />
        </div>
      </div>
    );

    const movedTarget = container.querySelector<HTMLElement>('[data-section-index="1"]')!;
    const movedScrollIntoView = vi.fn();
    Object.defineProperty(movedTarget, "scrollIntoView", {
      configurable: true,
      value: movedScrollIntoView
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transpose at 0:10" }));

    expect(movedScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
    expect(
      screen.getByText(/Lock that transpose on Bass Guitar at 0:10 before the room starts./)
    ).toBeTruthy();
  });
});
