import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../../i18n";
import { TapTempo } from "./TapTempo";

const t = createTranslator("en");

describe("TapTempo", () => {
  it("names the tap next action and unlocks a 120 BPM count-in after four steady taps", () => {
    let now = 10_000;
    render(<TapTempo t={t} nowMs={() => now} />);

    const region = screen.getByTestId("tap-tempo");
    expect(region).toHaveTextContent("Tonight's tap tempo");
    expect(region).toHaveTextContent(
      "Tonight's first count-in still needs a tempo. Tap a steady groove at least four times, then count in at that tempo and check the first range."
    );

    const tap = screen.getByRole("button", { name: /tap the groove to set tonight's tempo/i });
    fireEvent.click(tap);
    now += 500;
    fireEvent.click(tap);
    expect(region).toHaveTextContent("Keep tapping a steady groove");
    now += 500;
    fireEvent.click(tap);
    now += 500;
    fireEvent.click(tap);

    expect(region).toHaveTextContent("120 BPM from 4 taps. Count in 4 at 120 BPM, then check tonight's first range.");
    expect(screen.getByTestId("tap-lamp-0").className).toContain("bg-amber-300");
    expect(screen.getByTestId("tap-lamp-3").className).toContain("bg-amber-300");
  });

  it("resets the session taps without writing a song tempo", () => {
    let now = 1_000;
    render(<TapTempo t={t} nowMs={() => now} />);
    const tap = screen.getByRole("button", { name: /tap the groove to set tonight's tempo/i });
    fireEvent.click(tap);
    now += 500;
    fireEvent.click(tap);
    fireEvent.click(screen.getByRole("button", { name: /reset tonight's tap tempo/i }));
    expect(screen.getByTestId("tap-tempo")).toHaveTextContent(
      "Tonight's first count-in still needs a tempo. Tap a steady groove at least four times, then count in at that tempo and check the first range."
    );
    expect(screen.getByRole("button", { name: /reset tonight's tap tempo/i })).toBeDisabled();
  });
});
