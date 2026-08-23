import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstOpenCommentCallout } from "./FirstOpenCommentCallout";

describe("FirstOpenCommentCallout hostile runtime identity", () => {
  it("contains a song identity descriptor trap without discarding the valid owned comment", () => {
    const song = createDemoRehearsalSong();
    const hostileSong = new Proxy(song, {
      getOwnPropertyDescriptor(target, property) {
        if (property === "id") {
          throw new Error("hostile song id descriptor trap");
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
    });

    expect(() => render(<FirstOpenCommentCallout song={hostileSong} />)).not.toThrow();
    expect(
      screen.getByText("MD left a note for Keyboard 1 Right Hand in the verse at 0:10.")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Keep the keyboard color tone gentle on the first pass so the vocal cue stays forward."
      )
    ).toBeTruthy();
  });
});
