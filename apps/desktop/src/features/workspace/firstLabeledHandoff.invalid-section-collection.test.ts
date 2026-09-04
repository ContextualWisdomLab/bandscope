import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import type { RehearsalSong } from "@bandscope/shared-types";
import { resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

function songWithRuntimeSections(sections: unknown): RehearsalSong {
  const song = createDemoRehearsalSong();
  song.sections = sections as RehearsalSong["sections"];
  return song;
}

function runtimeSong(value: unknown): RehearsalSong {
  return value as RehearsalSong;
}

describe("resolveFirstLabeledHandoff runtime section collection", () => {
  it("fails closed when the runtime song root is null", () => {
    const song = runtimeSong(null);

    expect(() => resolveFirstLabeledHandoff(song)).not.toThrow();
    expect(resolveFirstLabeledHandoff(song)).toBeNull();
  });

  it("fails closed when the runtime song root is primitive", () => {
    const song = runtimeSong(42);

    expect(() => resolveFirstLabeledHandoff(song)).not.toThrow();
    expect(resolveFirstLabeledHandoff(song)).toBeNull();
  });

  it("fails closed when the runtime section collection is not an array", () => {
    const song = songWithRuntimeSections(null);

    expect(() => resolveFirstLabeledHandoff(song)).not.toThrow();
    expect(resolveFirstLabeledHandoff(song)).toBeNull();
  });

  it("ignores malformed section elements instead of dereferencing them", () => {
    const song = songWithRuntimeSections([null, 42]);

    expect(() => resolveFirstLabeledHandoff(song)).not.toThrow();
    expect(resolveFirstLabeledHandoff(song)).toBeNull();
  });
});
