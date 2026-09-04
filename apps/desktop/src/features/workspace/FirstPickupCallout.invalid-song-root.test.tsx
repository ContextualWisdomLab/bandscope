import { render, screen } from "@testing-library/react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstPickupCallout } from "./FirstPickupCallout";

/** Cast runtime input through the static song contract to exercise the renderer trust boundary. */
function runtimeSong(value: unknown): RehearsalSong {
  return value as RehearsalSong;
}

describe("FirstPickupCallout malformed song root", () => {
  it("renders unavailable guidance instead of crashing when the runtime song root is null", () => {
    expect(() => render(<FirstPickupCallout song={runtimeSong(null)} />)).not.toThrow();
    expect(
      screen.getByText("No pickup yet. Stay on tonight's map until a part is ready to catch the handoff.")
    ).toBeTruthy();
  });
});
