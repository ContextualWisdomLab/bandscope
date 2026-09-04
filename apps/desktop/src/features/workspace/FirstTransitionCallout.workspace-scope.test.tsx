import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it, vi } from "vitest";
import { FirstTransitionCallout } from "./FirstTransitionCallout";

it("opens the transition in its own workspace when multiple song maps are mounted", () => {
  const song = createDemoRehearsalSong();
  const { container } = render(
    <>
      <section data-workspace="first">
        <FirstTransitionCallout song={song} />
        <div data-testid="song-structure-grid">
          <div data-section-index="0" />
        </div>
      </section>
      <section data-workspace="second">
        <FirstTransitionCallout song={song} />
        <div data-testid="song-structure-grid">
          <div data-section-index="0" />
        </div>
      </section>
    </>
  );

  const firstTarget = container.querySelector<HTMLElement>(
    '[data-workspace="first"] [data-section-index="0"]'
  )!;
  const secondTarget = container.querySelector<HTMLElement>(
    '[data-workspace="second"] [data-section-index="0"]'
  )!;
  const firstScroll = vi.fn();
  const secondScroll = vi.fn();
  Object.defineProperty(firstTarget, "scrollIntoView", { configurable: true, value: firstScroll });
  Object.defineProperty(secondTarget, "scrollIntoView", { configurable: true, value: secondScroll });

  fireEvent.click(
    screen.getAllByRole("button", { name: "Open Bass Guitar transition at 0:10" })[1]!
  );

  expect(firstScroll).not.toHaveBeenCalled();
  expect(secondScroll).toHaveBeenCalledOnce();
});
