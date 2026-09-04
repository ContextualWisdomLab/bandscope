import { expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstTransition } from "./firstTransition";

it("uses snapshotted own time-range values instead of Proxy get-trap substitutions", () => {
  const song = createDemoRehearsalSong();
  const section = song.sections[0]!;
  const trustedTimeRange = section.timeRange;

  section.timeRange = new Proxy(trustedTimeRange, {
    get(target, property, receiver) {
      if (property === "start") {
        return trustedTimeRange.start + 10;
      }
      return Reflect.get(target, property, receiver);
    }
  });

  expect(resolveFirstTransition(song)?.atSeconds).toBe(trustedTimeRange.start);
});
