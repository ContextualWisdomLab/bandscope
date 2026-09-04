import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstHarmonicExplanationCallout } from "./FirstHarmonicExplanationCallout";

describe("FirstHarmonicExplanationCallout sections access", () => {
  it("contains a hostile sections get trap after descriptor-backed resolution", () => {
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
      render(<FirstHarmonicExplanationCallout song={hostileSong as RehearsalSong} />)
    ).not.toThrow();
    expect(
      screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" })
    ).toBeTruthy();
  });

  it("contains a hostile song-id descriptor trap without losing the resolved explanation", () => {
    const song = createDemoRehearsalSong();
    const hostileSong = new Proxy(song, {
      getOwnPropertyDescriptor(target, property) {
        if (property === "id") {
          throw new Error("hostile song id descriptor trap");
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
    });

    expect(() =>
      render(<FirstHarmonicExplanationCallout song={hostileSong as RehearsalSong} />)
    ).not.toThrow();
    expect(
      screen.getByRole("button", { name: "Open Bass Guitar explanation at 0:10" })
    ).toBeTruthy();
  });
});
