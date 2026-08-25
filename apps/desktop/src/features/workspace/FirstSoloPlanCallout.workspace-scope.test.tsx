import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstSoloPlanCallout } from "./FirstSoloPlanCallout";

describe("FirstSoloPlanCallout workspace scope", () => {
  it("opens the song-structure renderer owned by the current workspace", () => {
    const firstSong = createDemoRehearsalSong();
    const secondSong = createDemoRehearsalSong();
    secondSong.id = "second-workspace-song";
    const firstSectionId = firstSong.sections[0]!.id;
    const secondSectionId = secondSong.sections[0]!.id;

    const { container } = render(
      <>
        <div data-testid="workspace-one">
          <FirstSoloPlanCallout song={firstSong} />
          <div data-testid="song-structure-grid">
            <div data-section-id={firstSectionId} />
          </div>
        </div>
        <div data-testid="workspace-two">
          <FirstSoloPlanCallout song={secondSong} />
          <div data-testid="song-structure-grid">
            <div data-section-id={secondSectionId} />
          </div>
        </div>
      </>
    );

    const targets = container.querySelectorAll<HTMLElement>("[data-section-id]");
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
      name: "Open Keyboard 1 Right Hand solo at 0:10"
    });
    expect(actions).toHaveLength(2);
    fireEvent.click(actions[1]!);

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
  });

  it("navigates to the stable section identity even when rendered section order changes", () => {
    const song = createDemoRehearsalSong();
    const expectedSectionId = song.sections[0]!.id;
    const { container } = render(
      <div>
        <FirstSoloPlanCallout song={song} />
        <div data-testid="song-structure-grid">
          <div data-section-id="rendered-before-the-solo" />
          <div data-section-id={expectedSectionId} />
        </div>
      </div>
    );

    const targets = container.querySelectorAll<HTMLElement>("[data-section-id]");
    expect(targets).toHaveLength(2);
    const wrongScrollIntoView = vi.fn();
    const expectedScrollIntoView = vi.fn();
    Object.defineProperty(targets[0]!, "scrollIntoView", {
      configurable: true,
      value: wrongScrollIntoView
    });
    Object.defineProperty(targets[1]!, "scrollIntoView", {
      configurable: true,
      value: expectedScrollIntoView
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Open Keyboard 1 Right Hand solo at 0:10" })
    );

    expect(wrongScrollIntoView).not.toHaveBeenCalled();
    expect(expectedScrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth"
    });
  });

  it("fails closed when the current workspace contains multiple song-structure renderers", () => {
    const song = createDemoRehearsalSong();
    const sectionId = song.sections[0]!.id;
    const { container } = render(
      <div>
        <FirstSoloPlanCallout song={song} />
        <div data-testid="song-structure-grid">
          <div data-section-id={sectionId} />
        </div>
        <div data-testid="song-structure-grid">
          <div data-section-id={sectionId} />
        </div>
      </div>
    );

    const targets = container.querySelectorAll<HTMLElement>("[data-section-id]");
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

    fireEvent.click(
      screen.getByRole("button", { name: "Open Keyboard 1 Right Hand solo at 0:10" })
    );

    expect(firstScrollIntoView).not.toHaveBeenCalled();
    expect(secondScrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText("Keyboard 1 Right Hand still has a solo plan in the verse at 0:10.")).toBeTruthy();
  });
});
