import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { FirstTransitionCallout } from "./FirstTransitionCallout";

function appendTransitionTarget() {
  const renderer = document.createElement("div");
  renderer.dataset.testid = "song-structure-grid";
  const target = document.createElement("div");
  target.dataset.sectionIndex = "0";
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
  renderer.appendChild(target);
  document.body.appendChild(renderer);
  return renderer;
}

describe("FirstTransitionCallout song identity", () => {
  it("keeps opened guidance when an immutable update replaces the song object without changing the transition", () => {
    const renderer = appendTransitionTarget();
    const song = createDemoRehearsalSong();
    const { rerender } = render(<FirstTransitionCallout song={song} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar transition at 0:10" }));
    expect(
      screen.getByText("Catch the change with Bass Guitar at 0:10. Stay together through it.")
    ).toBeTruthy();

    rerender(<FirstTransitionCallout song={{ ...song }} />);

    expect(
      screen.getByText("Catch the change with Bass Guitar at 0:10. Stay together through it.")
    ).toBeTruthy();
    renderer.remove();
  });
});
