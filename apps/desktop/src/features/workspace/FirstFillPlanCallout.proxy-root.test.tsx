import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstFillPlanCallout } from "./FirstFillPlanCallout";

it("does not read root sections through a Proxy get trap after validating the fill plan", () => {
  const source = createDemoRehearsalSong();
  const song = new Proxy(source, {
    get(target, property, receiver) {
      if (property === "sections") {
        throw new Error("root sections must be consumed from owned data authority");
      }
      return Reflect.get(target, property, receiver);
    }
  });

  render(<FirstFillPlanCallout song={song} />);

  expect(
    screen.getByText("Walk eight notes into the chorus downbeat; leave the vocal pickup empty.")
  ).toBeTruthy();
});
