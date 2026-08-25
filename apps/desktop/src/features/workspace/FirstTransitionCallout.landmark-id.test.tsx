import { render } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstTransitionCallout } from "./FirstTransitionCallout";

it("gives co-mounted transition callouts distinct DOM identities", () => {
  const song = createDemoRehearsalSong();
  const { container } = render(
    <>
      <FirstTransitionCallout song={song} />
      <FirstTransitionCallout song={song} />
    </>
  );

  const calloutIds = Array.from(
    container.querySelectorAll<HTMLElement>('[id^="workspace-surface-transition-"]'),
    (element) => element.id
  );

  expect(calloutIds).toHaveLength(2);
  expect(new Set(calloutIds).size).toBe(calloutIds.length);
});
