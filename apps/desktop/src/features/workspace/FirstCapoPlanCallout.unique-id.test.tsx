import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstCapoPlanCallout } from "./FirstCapoPlanCallout";

describe("FirstCapoPlanCallout landmark identity", () => {
  it("uses unique ids when multiple capo-plan callouts are mounted", () => {
    const song = createDemoRehearsalSong();

    render(
      <>
        <FirstCapoPlanCallout song={song} />
        <FirstCapoPlanCallout song={song} />
      </>
    );

    const regions = screen.getAllByRole("complementary", {
      name: "Tonight's first capo plan"
    });
    expect(regions).toHaveLength(2);
    const ids = regions.map((region) => region.id);
    expect(ids.every((id) => id.startsWith("workspace-surface-capo-plan-"))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
