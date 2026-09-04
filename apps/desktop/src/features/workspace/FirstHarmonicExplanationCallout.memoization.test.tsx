import { render } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";

const { resolveCalls } = vi.hoisted(() => ({
  resolveCalls: vi.fn()
}));

vi.mock("./firstHarmonicExplanation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./firstHarmonicExplanation")>();
  return {
    ...actual,
    resolveFirstHarmonicExplanation: (song: Parameters<typeof actual.resolveFirstHarmonicExplanation>[0]) => {
      resolveCalls(song);
      return actual.resolveFirstHarmonicExplanation(song);
    }
  };
});

import { FirstHarmonicExplanationCallout } from "./FirstHarmonicExplanationCallout";

describe("FirstHarmonicExplanationCallout memoization", () => {
  it("does not rescan an unchanged song when its parent rerenders", () => {
    const song = createDemoRehearsalSong();
    const { rerender } = render(<FirstHarmonicExplanationCallout song={song} />);

    expect(resolveCalls).toHaveBeenCalledTimes(1);

    rerender(<FirstHarmonicExplanationCallout song={song} />);

    expect(resolveCalls).toHaveBeenCalledTimes(1);
  });
});
