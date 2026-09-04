import { render } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstFillPlanCallout } from "./FirstFillPlanCallout";

describe("FirstFillPlanCallout resolver reuse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not rescan role metadata when a parent rerenders the same song object", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    const descriptorSpy = vi.spyOn(Object, "getOwnPropertyDescriptor");

    const { rerender } = render(<FirstFillPlanCallout song={song} />);
    const firstScanCount = descriptorSpy.mock.calls.filter(([target]) => target === role).length;
    expect(firstScanCount).toBeGreaterThan(0);

    rerender(<FirstFillPlanCallout song={song} />);
    const secondScanCount = descriptorSpy.mock.calls.filter(([target]) => target === role).length;

    expect(secondScanCount).toBe(firstScanCount);
  });
});
