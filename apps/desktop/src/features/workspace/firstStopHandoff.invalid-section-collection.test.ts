import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import type { RehearsalSong } from "@bandscope/shared-types";
import { resolveFirstStopHandoff } from "./firstStopHandoff";

function songWithRuntimeSections(sections: unknown): RehearsalSong {
  const song = createDemoRehearsalSong();
  song.sections = sections as RehearsalSong["sections"];
  return song;
}

describe("resolveFirstStopHandoff runtime section collection", () => {
  it("fails closed when the runtime section collection is not an array", () => {
    const song = songWithRuntimeSections(null);

    expect(() => resolveFirstStopHandoff(song)).not.toThrow();
    expect(resolveFirstStopHandoff(song)).toBeNull();
  });

  it("ignores malformed section elements instead of dereferencing them", () => {
    const song = songWithRuntimeSections([null, 42]);

    expect(() => resolveFirstStopHandoff(song)).not.toThrow();
    expect(resolveFirstStopHandoff(song)).toBeNull();
  });
});
