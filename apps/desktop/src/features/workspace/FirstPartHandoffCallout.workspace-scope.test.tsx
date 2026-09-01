import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirstPartHandoffCallout } from "./FirstPartHandoffCallout";
import { createPartHandoffTransitionSong } from "./firstPartHandoff.test-fixture";

describe("FirstPartHandoffCallout workspace scope", () => {
  it("opens the destination renderer owned by the current workspace", () => {
    const firstSong = createPartHandoffTransitionSong();
    const secondSong = createPartHandoffTransitionSong();
    secondSong.id = "second-workspace-song";

    const { container } = render(
      <>
        <div data-testid="workspace-one">
          <FirstPartHandoffCallout song={firstSong} />
          <div id="workspace-song-structure-grid">
            <div data-section-index="0" />
            <div data-section-index="1" />
          </div>
        </div>
        <div data-testid="workspace-two">
          <FirstPartHandoffCallout song={secondSong} />
          <div id="workspace-song-structure-grid">
            <div data-section-index="0" />
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
      name: "Open Bass Guitar handoff at 0:10"
    });
    expect(actions).toHaveLength(2);
    fireEvent.click(actions[1]!);

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
  });
});
