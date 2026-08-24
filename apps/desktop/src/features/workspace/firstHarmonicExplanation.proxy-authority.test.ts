import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHarmonicExplanation } from "./firstHarmonicExplanation";

describe("resolveFirstHarmonicExplanation Proxy authority", () => {
  it("uses the owned explanation descriptor instead of a Proxy get substitution", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    const trustedExplanation = role.harmonicExplanation!;
    const hostileRole = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "harmonicExplanation") {
          return "proxy injected explanation";
        }
        return Reflect.get(target, property, receiver);
      }
    });
    song.sections[0]!.roles[0] = hostileRole;

    expect(resolveFirstHarmonicExplanation(song)?.explanation).toBe(trustedExplanation);
  });
});
