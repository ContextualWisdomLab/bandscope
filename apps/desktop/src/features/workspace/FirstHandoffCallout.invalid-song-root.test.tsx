import { render, screen } from "@testing-library/react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstHandoffCallout } from "./FirstHandoffCallout";

/** Cast runtime input through the static song contract to exercise the renderer trust boundary. */
function runtimeSong(value: unknown): RehearsalSong {
  return value as RehearsalSong;
}

describe("FirstHandoffCallout malformed song root", () => {
  it("renders unavailable guidance instead of crashing when the runtime song root is null", () => {
    expect(() => render(<FirstHandoffCallout song={runtimeSong(null)} />)).not.toThrow();
    expect(screen.getByText("No handoff yet. Stay on tonight's map until a pass is marked.")).toBeTruthy();
  });
});
