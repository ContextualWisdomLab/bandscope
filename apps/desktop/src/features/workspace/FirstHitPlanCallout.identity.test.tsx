import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it, vi } from "vitest";
import { FirstHitPlanCallout } from "./FirstHitPlanCallout";

it("gives co-mounted hit-plan callouts distinct DOM identities", () => {
  render(
    <>
      <FirstHitPlanCallout song={createDemoRehearsalSong()} />
      <FirstHitPlanCallout song={createDemoRehearsalSong()} />
    </>
  );

  const callouts = screen.getAllByRole("complementary", {
    name: "Tonight's first hit plan"
  });
  const ids = callouts.map((callout) => callout.id);

  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(callouts.length);
});

it("resets opened state when a distinct song object reuses the analysis song id", () => {
  const firstSong = createDemoRehearsalSong();
  const nextSong = createDemoRehearsalSong();
  firstSong.id = "analyzed-song";
  nextSong.id = "analyzed-song";

  const view = (song: typeof firstSong) => (
    <div>
      <div data-testid="song-structure-grid">
        <div data-section-index="0" />
      </div>
      <FirstHitPlanCallout song={song} />
    </div>
  );
  const { container, rerender } = render(view(firstSong));
  const sectionTarget = container.querySelector<HTMLElement>('[data-section-index="0"]');
  expect(sectionTarget).not.toBeNull();
  if (!sectionTarget) {
    throw new Error("Hit-plan identity regression fixture is missing the first rendered section.");
  }
  sectionTarget.scrollIntoView = vi.fn();

  const initialBody = screen.getByText(/has a shared hit in/).textContent;
  expect(initialBody).toBeTruthy();
  fireEvent.click(screen.getByRole("button"));
  expect(screen.queryByText(initialBody ?? "")).toBeNull();

  rerender(view(nextSong));

  expect(screen.getByText(initialBody ?? "")).toBeTruthy();
});
