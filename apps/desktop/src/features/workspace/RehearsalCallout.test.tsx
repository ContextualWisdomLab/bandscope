import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RehearsalCallout } from "./RehearsalCallout";

describe("RehearsalCallout", () => {
  it("names the first practice action", () => {
    const onAction = vi.fn();
    render(
      <RehearsalCallout
        title="Lock the chorus bass first"
        body="Bass and vocal overlap here. Loop the chorus before the room starts."
        actionLabel="Loop the chorus"
        onAction={onAction}
      />
    );

    expect(screen.getByLabelText("Lock the chorus bass first")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Loop the chorus" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("marks an unwired practice action unavailable", () => {
    render(
      <RehearsalCallout
        title="Confirm the pickup"
        body="Low confidence on the verse pickup. Hear it once before you simplify."
        actionLabel="Hear the pickup"
      />
    );

    expect(screen.getByText("Confirm the pickup")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hear the pickup" })).toBeDisabled();
  });
});
