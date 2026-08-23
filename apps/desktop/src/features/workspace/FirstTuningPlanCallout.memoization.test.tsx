import { render } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it, vi } from "vitest";

const { resolveFirstTuningPlanSpy } = vi.hoisted(() => ({
  resolveFirstTuningPlanSpy: vi.fn()
}));

vi.mock("./firstTuningPlan", async () => {
  const actual = await vi.importActual<typeof import("./firstTuningPlan")>("./firstTuningPlan");
  return {
    ...actual,
    resolveFirstTuningPlan: (...args: Parameters<typeof actual.resolveFirstTuningPlan>) => {
      resolveFirstTuningPlanSpy(...args);
      return actual.resolveFirstTuningPlan(...args);
    }
  };
});

import { FirstTuningPlanCallout } from "./FirstTuningPlanCallout";

it("does not rescan an unchanged rehearsal song on parent rerender", () => {
  const song = createDemoRehearsalSong();
  const { rerender } = render(<FirstTuningPlanCallout song={song} />);

  expect(resolveFirstTuningPlanSpy).toHaveBeenCalledTimes(1);

  rerender(<FirstTuningPlanCallout song={song} />);

  expect(resolveFirstTuningPlanSpy).toHaveBeenCalledTimes(1);
});
