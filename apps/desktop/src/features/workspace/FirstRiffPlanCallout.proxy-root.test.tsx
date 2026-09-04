import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstRiffPlanCallout } from "./FirstRiffPlanCallout";

it("does not re-read root sections through a Proxy get trap after resolving the riff plan", () => {
  const source = createDemoRehearsalSong();
  let sectionReads = 0;
  const song = new Proxy(source, {
    get(target, property, receiver) {
      if (property === "sections") {
        sectionReads += 1;
        if (sectionReads > 2) {
          throw new Error("root sections were re-read after resolver validation");
        }
      }
      return Reflect.get(target, property, receiver);
    }
  });

  expect(() => render(<FirstRiffPlanCallout song={song} />)).not.toThrow();
  expect(
    screen.getByText(
      "Bass locks the verse riff on the open fifth; keep it dry before the chorus lift."
    )
  ).toBeTruthy();
});
