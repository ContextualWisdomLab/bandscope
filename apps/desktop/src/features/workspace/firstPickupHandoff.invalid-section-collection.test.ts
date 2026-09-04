import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupHandoff } from "./firstPickupHandoff";

/** Cast runtime input through the static song contract to exercise the resolver trust boundary. */
function runtimeSong(value: unknown): RehearsalSong {
  return value as RehearsalSong;
}

/** Replace the section collection with untrusted runtime evidence. */
function songWithRuntimeSections(sections: unknown): RehearsalSong {
  const song = createDemoRehearsalSong();
  song.sections = sections as RehearsalSong["sections"];
  return song;
}

describe("resolveFirstPickupHandoff runtime section collection", () => {
  it("fails closed when the runtime song root is null", () => {
    const song = runtimeSong(null);

    expect(() => resolveFirstPickupHandoff(song)).not.toThrow();
    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });

  it("fails closed when the runtime section collection is not an array", () => {
    const song = songWithRuntimeSections(null);

    expect(() => resolveFirstPickupHandoff(song)).not.toThrow();
    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });

  it("ignores malformed section elements instead of dereferencing them", () => {
    const song = songWithRuntimeSections([null, 42]);

    expect(() => resolveFirstPickupHandoff(song)).not.toThrow();
    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });
});
