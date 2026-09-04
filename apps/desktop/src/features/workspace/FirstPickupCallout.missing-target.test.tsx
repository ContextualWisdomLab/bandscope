import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstPickupCallout } from "./FirstPickupCallout";

describe("FirstPickupCallout renderer-owned action completion", () => {
  it("does not arm the pickup when the renderer-owned section target is missing", () => {
    render(<FirstPickupCallout song={createDemoRehearsalSong()} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Lead Vocal pickup from Bass Guitar at 0:30"
      })
    );

    expect(screen.getByText("Lead Vocal picks up from Bass Guitar at the end of the verse (0:30).")).toBeTruthy();
    expect(
      screen.queryByText(/Start Lead Vocal's pickup from Bass Guitar before the next downbeat \(0:30\)/)
    ).toBeNull();
  });
});
