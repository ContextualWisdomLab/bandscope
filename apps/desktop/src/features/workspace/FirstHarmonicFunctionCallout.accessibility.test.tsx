import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstHarmonicFunctionCallout } from "./FirstHarmonicFunctionCallout";

describe("FirstHarmonicFunctionCallout accessibility", () => {
  it("keeps the unavailable region name concise and stable", () => {
    render(<FirstHarmonicFunctionCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByRole("complementary", { name: "Tonight's first harmonic function" })
    ).toBeTruthy();
  });

  it("gives separately mounted callouts unique DOM ids", () => {
    render(
      <>
        <FirstHarmonicFunctionCallout song={createDemoRehearsalSong()} />
        <FirstHarmonicFunctionCallout song={createDemoRehearsalSong()} />
      </>
    );

    const callouts = screen.getAllByRole("complementary", {
      name: "Tonight's first harmonic function"
    });
    expect(callouts).toHaveLength(2);
    expect(callouts.every((callout) => callout.id.length > 0)).toBe(true);
    expect(new Set(callouts.map((callout) => callout.id)).size).toBe(callouts.length);
  });
});
