import { render } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it, vi } from "vitest";

const { resolveFirstDynamicsPlanSpy } = vi.hoisted(() => ({
  resolveFirstDynamicsPlanSpy: vi.fn()
}));

vi.mock("./firstDynamicsPlan", async () => {
  const actual = await vi.importActual<typeof import("./firstDynamicsPlan")>("./firstDynamicsPlan");
  return {
    ...actual,
    resolveFirstDynamicsPlan: (...args: Parameters<typeof actual.resolveFirstDynamicsPlan>) => {
      resolveFirstDynamicsPlanSpy(...args);
      return actual.resolveFirstDynamicsPlan(...args);
    }
  };
});

import { FirstDynamicsPlanCallout } from "./FirstDynamicsPlanCallout";

it("does not rescan an unchanged rehearsal song on parent rerender", () => {
  const song = createDemoRehearsalSong();
  const { rerender } = render(<FirstDynamicsPlanCallout song={song} />);

  expect(resolveFirstDynamicsPlanSpy).toHaveBeenCalledTimes(1);

  rerender(<FirstDynamicsPlanCallout song={song} />);

  expect(resolveFirstDynamicsPlanSpy).toHaveBeenCalledTimes(1);
});
