import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../i18n";
import { CountInClick } from "./CountInClick";
import type { CountInClickEngine } from "./countInClickEngine";
import type { FirstCountInPlan } from "./firstCountIn";

const t = createTranslator("en");
const plan: FirstCountInPlan = {
  tempoBpm: 120,
  beats: 4,
  intervalMs: 500,
  sectionLabel: "verse"
};

describe("CountInClick semantic plan lifecycle", () => {
  it("keeps an active count-in running when an equivalent plan object replaces the prior object", async () => {
    let finishPlay: (() => void) | undefined;
    const engine: CountInClickEngine = {
      available: true,
      play: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishPlay = resolve;
          })
      ),
      stop: vi.fn()
    };
    const { rerender } = render(<CountInClick plan={plan} t={t} engine={engine} />);
    fireEvent.click(screen.getByRole("button", { name: /count in 4 at 120 bpm/i }));

    rerender(<CountInClick plan={{ ...plan }} t={t} engine={engine} />);

    expect(engine.stop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /count in 4 at 120 bpm/i })).toHaveTextContent("Counting in");
    finishPlay?.();
    await waitFor(() => {
      expect(screen.getByText("Now check that span on your instrument.")).toBeTruthy();
    });
  });
});
