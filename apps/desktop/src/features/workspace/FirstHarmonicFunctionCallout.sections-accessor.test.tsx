import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstHarmonicFunctionCallout } from "./FirstHarmonicFunctionCallout";

describe("FirstHarmonicFunctionCallout sections access", () => {
  it("contains a hostile sections get trap after harmonic-function resolution", () => {
    const song = createDemoRehearsalSong();
    let sectionReads = 0;
    const hostileSong = new Proxy(song, {
      get(target, property, receiver) {
        if (property === "sections") {
          sectionReads += 1;
          if (sectionReads > 2) {
            throw new Error("hostile sections get trap");
          }
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(() =>
      render(<FirstHarmonicFunctionCallout song={hostileSong as RehearsalSong} />)
    ).not.toThrow();
    expect(
      screen.getByRole("button", { name: "Open Bass Guitar function at 0:10" })
    ).toBeTruthy();
  });
});
