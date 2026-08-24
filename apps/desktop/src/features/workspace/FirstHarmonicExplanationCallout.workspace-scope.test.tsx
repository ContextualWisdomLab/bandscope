import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstHarmonicExplanationCallout } from "./FirstHarmonicExplanationCallout";

describe("FirstHarmonicExplanationCallout workspace scope", () => {
  it("opens the song-structure renderer owned by the current workspace", () => {
    const firstSong = createDemoRehearsalSong();
    const secondSong = createDemoRehearsalSong();
    secondSong.id = "second-workspace-song";

    const { container } = render(
      <>
        <div data-testid="workspace-one">
          <FirstHarmonicExplanationCallout song={firstSong} />
          <div data-testid="song-structure-grid">
            <div data-section-index="0" />
          </div>
        </div>
        <div data-testid="workspace-two">
          <FirstHarmonicExplanationCallout song={secondSong} />
          <div data-testid="song-structure-grid">
            <div data-section-index="0" />
          </div>
        </div>
      </>
    );

    const callouts = screen.getAllByRole("complementary", {
      name: "Tonight's first harmonic explanation"
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
      name: "Open Bass Guitar explanation at 0:10"
    });
    expect(actions).toHaveLength(2);
    fireEvent.click(actions[1]!);

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
  });

  it("fails closed when one workspace contains multiple song-structure renderers", () => {
    const { container } = render(
      <div data-testid="workspace">
        <FirstHarmonicExplanationCallout song={createDemoRehearsalSong()} />
        <div data-testid="song-structure-grid">
          <div data-section-index="0" />
        </div>
        <div data-testid="song-structure-grid">
          <div data-section-index="0" />
        </div>
      </div>
    );
    const targets = container.querySelectorAll<HTMLElement>('[data-section-index="0"]');
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

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" }));

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).not.toHaveBeenCalled();
    expect(
      screen.getByText("Bass Guitar still has a harmonic explanation in the verse at 0:10.")
    ).toBeTruthy();
  });

  it("fails closed when only globally ambiguous song-structure renderers are available", () => {
    const { container } = render(
      <FirstHarmonicExplanationCallout song={createDemoRehearsalSong()} />
    );
    const externalRenderers = [document.createElement("div"), document.createElement("div")];
    const scrollIntoViews = externalRenderers.map(() => vi.fn());
    externalRenderers.forEach((renderer, index) => {
      renderer.dataset.testid = "song-structure-grid";
      const target = document.createElement("div");
      target.dataset.sectionIndex = "0";
      Object.defineProperty(target, "scrollIntoView", {
        configurable: true,
        value: scrollIntoViews[index]
      });
      renderer.appendChild(target);
      document.body.appendChild(renderer);
    });

    fireEvent.click(
      container.querySelector<HTMLButtonElement>("button") ??
        screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" })
    );

    expect(scrollIntoViews[0]).not.toHaveBeenCalled();
    expect(scrollIntoViews[1]).not.toHaveBeenCalled();
    expect(
      screen.getByText("Bass Guitar still has a harmonic explanation in the verse at 0:10.")
    ).toBeTruthy();

    externalRenderers.forEach((renderer) => renderer.remove());
  });
});
