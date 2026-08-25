import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstTuningPlanCallout } from "./FirstTuningPlanCallout";

describe("FirstTuningPlanCallout workspace scope", () => {
  it("opens the song-structure renderer owned by the current workspace", () => {
    const firstSong = createDemoRehearsalSong();
    const secondSong = createDemoRehearsalSong();
    secondSong.id = "second-workspace-song";

    const { container } = render(
      <>
        <div data-testid="workspace-one">
          <FirstTuningPlanCallout song={firstSong} />
          <div data-testid="song-structure-grid">
            <div data-section-index="0" />
          </div>
        </div>
        <div data-testid="workspace-two">
          <FirstTuningPlanCallout song={secondSong} />
          <div data-testid="song-structure-grid">
            <div data-section-index="0" />
          </div>
        </div>
      </>
    );

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
      name: "Open Bass Guitar tuning at 0:10"
    });
    expect(actions).toHaveLength(2);
    fireEvent.click(actions[1]!);

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
  });

  it("publishes a unique landmark id for each mounted tuning-plan callout", () => {
    const firstSong = createDemoRehearsalSong();
    const secondSong = createDemoRehearsalSong();
    secondSong.id = "second-workspace-song";

    render(
      <>
        <FirstTuningPlanCallout song={firstSong} />
        <FirstTuningPlanCallout song={secondSong} />
      </>
    );

    const regions = screen.getAllByRole("complementary", { name: "Tonight's first tuning plan" });
    expect(regions).toHaveLength(2);
    const ids = regions.map((region) => region.id);
    expect(ids.every((id) => id.startsWith("workspace-surface-tuning-plan-"))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
