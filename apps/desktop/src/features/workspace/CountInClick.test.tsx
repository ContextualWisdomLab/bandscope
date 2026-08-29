import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CountInClick } from "./CountInClick";
import type { CountInClickEngine } from "./countInClickEngine";
import type { FirstCountInPlan } from "./firstCountIn";
import { createTranslator } from "../../i18n";

const t = createTranslator("en");
const plan: FirstCountInPlan = {
  tempoBpm: 120,
  beats: 4,
  intervalMs: 500,
  sectionLabel: "verse"
};

function renderCountIn(engine: CountInClickEngine, nextPlan: FirstCountInPlan | null = plan) {
  return render(<CountInClick plan={nextPlan} t={t} engine={engine} />);
}

describe("CountInClick", () => {
  it("names the count-in next action and plays a local click", async () => {
    const engine: CountInClickEngine = {
      available: true,
      play: vi.fn(async () => undefined),
      stop: vi.fn()
    };
    renderCountIn(engine);

    const region = screen.getByTestId("first-count-in");
    expect(region).toHaveTextContent("Tonight's first count-in");
    expect(region).toHaveTextContent(
      "Count in 4 at 120 BPM, then check tonight's first range before the verse."
    );

    fireEvent.click(screen.getByRole("button", { name: /count in 4 at 120 bpm/i }));
    expect(engine.play).toHaveBeenCalledWith(plan);
    await waitFor(() => {
      expect(screen.getByText("Now check that span on your instrument.")).toBeTruthy();
    });
  });

  it("asks the room to name a section when tempo is trusted but unlabeled", () => {
    const engine: CountInClickEngine = {
      available: true,
      play: vi.fn(async () => undefined),
      stop: vi.fn()
    };
    renderCountIn(engine, { ...plan, sectionLabel: undefined });
    expect(screen.getByTestId("first-count-in")).toHaveTextContent(
      "Count in 4 at 120 BPM, then name the first section so the room knows where it starts."
    );
  });

  it("fails closed without a tempo and does not start a click", () => {
    const engine: CountInClickEngine = {
      available: true,
      play: vi.fn(async () => undefined),
      stop: vi.fn()
    };
    renderCountIn(engine, null);
    expect(screen.getByTestId("first-count-in")).toHaveTextContent(
      "Tonight's first count-in still needs a tempo. Count the first section in by ear before you start."
    );
    fireEvent.click(screen.getByRole("button", { name: /^count in$/i }));
    expect(engine.play).not.toHaveBeenCalled();
  });

  it("blocks when the host cannot synthesize a click and when play throws", async () => {
    const unavailable: CountInClickEngine = {
      available: false,
      play: vi.fn(async () => undefined),
      stop: vi.fn()
    };
    const { rerender } = renderCountIn(unavailable);
    fireEvent.click(screen.getByRole("button", { name: /count in 4 at 120 bpm/i }));
    expect(screen.getByText(/this browser cannot play a click/i)).toBeTruthy();

    const failing: CountInClickEngine = {
      available: true,
      play: vi.fn(async () => {
        throw new Error("context failed");
      }),
      stop: vi.fn()
    };
    rerender(<CountInClick plan={plan} t={t} engine={failing} />);
    fireEvent.click(screen.getByRole("button", { name: /count in 4 at 120 bpm/i }));
    await waitFor(() => {
      expect(screen.getByText(/this browser cannot play a click/i)).toBeTruthy();
    });
  });

  it("ignores a second count-in click while the first is in flight", async () => {
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
    renderCountIn(engine);
    const button = screen.getByRole("button", { name: /count in 4 at 120 bpm/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(engine.play).toHaveBeenCalledTimes(1);
    finishPlay?.();
    await waitFor(() => {
      expect(screen.getByText("Now check that span on your instrument.")).toBeTruthy();
    });
  });

  it("stops a playing count-in and ignores a stale completion", async () => {
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
    renderCountIn(engine);
    fireEvent.click(screen.getByRole("button", { name: /count in 4 at 120 bpm/i }));
    expect(screen.getByRole("button", { name: /count in 4 at 120 bpm/i })).toHaveTextContent("Counting in");
    fireEvent.click(screen.getByRole("button", { name: /stop count-in/i }));
    expect(engine.stop).toHaveBeenCalled();
    finishPlay?.();
    await waitFor(() => {
      expect(screen.queryByText("Now check that span on your instrument.")).toBeNull();
    });
  });

  it("stops the old engine and invalidates completion when the active plan changes", async () => {
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
    const { rerender } = renderCountIn(engine);
    fireEvent.click(screen.getByRole("button", { name: /count in 4 at 120 bpm/i }));

    const nextPlan: FirstCountInPlan = {
      tempoBpm: 90,
      beats: 4,
      intervalMs: 60_000 / 90,
      sectionLabel: "chorus"
    };
    rerender(<CountInClick plan={nextPlan} t={t} engine={engine} />);

    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /count in 4 at 90 bpm/i })).toHaveTextContent("Count in");
    finishPlay?.();
    await waitFor(() => {
      expect(screen.queryByText("Now check that span on your instrument.")).toBeNull();
    });
  });

  it("stops the active engine when the count-in surface unmounts", () => {
    const engine: CountInClickEngine = {
      available: true,
      play: vi.fn(() => new Promise<void>(() => undefined)),
      stop: vi.fn()
    };
    const { unmount } = renderCountIn(engine);
    fireEvent.click(screen.getByRole("button", { name: /count in 4 at 120 bpm/i }));
    unmount();
    expect(engine.stop).toHaveBeenCalledTimes(1);
  });
});
