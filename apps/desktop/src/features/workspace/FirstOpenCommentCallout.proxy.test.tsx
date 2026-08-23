import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstOpenCommentCallout } from "./FirstOpenCommentCallout";

describe("FirstOpenCommentCallout hostile runtime identity", () => {
  it("contains a song identity descriptor trap instead of crashing the callout", () => {
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
      screen.getByText("No open note yet. Stay on tonight's map until someone leaves a rehearsal comment.")
    ).toBeTruthy();
  });
});
