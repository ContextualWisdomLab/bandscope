import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstTurnaroundPlanCallout } from "./FirstTurnaroundPlanCallout";

describe("FirstTurnaroundPlanCallout navigation failure", () => {
  it("tells the user when the named turnaround cannot be opened on the rendered map", () => {
    render(<FirstTurnaroundPlanCallout song={createDemoRehearsalSong()} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Bass Guitar turnaround at 0:30" }));

    expect(
      screen.getByText(
        "Could not open this turnaround on the song map. Use the map below to find the section."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(/Turn those last bars on Bass Guitar at 0:30 before the next section lands./)
    ).toBeNull();
  });
});
