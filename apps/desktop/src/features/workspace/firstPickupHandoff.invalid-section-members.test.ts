import { createDemoRehearsalSong, type RehearsalSection } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupHandoff } from "./firstPickupHandoff";

/** Force the demo verse through the labeled-pickup path for runtime-boundary tests. */
function labeledPickupSection(): RehearsalSection {
  const song = createDemoRehearsalSong();
  const section = song.sections[0]!;
  section.label = "pickup";
  return section;
}

describe("resolveFirstPickupHandoff runtime section members", () => {
  it("fails closed when a labeled pickup has a non-array role collection", () => {
    const song = createDemoRehearsalSong();
    const section = labeledPickupSection();
    section.roles = null as unknown as RehearsalSection["roles"];
    song.sections = [section];

    expect(() => resolveFirstPickupHandoff(song)).not.toThrow();
    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });

  it("fails closed when a labeled pickup has a non-array graph collection", () => {
    const song = createDemoRehearsalSong();
    const section = labeledPickupSection();
    section.partGraph = null as unknown as RehearsalSection["partGraph"];
    song.sections = [section];

    expect(() => resolveFirstPickupHandoff(song)).not.toThrow();
    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });

  it("ignores malformed role and graph elements instead of dereferencing them", () => {
    const song = createDemoRehearsalSong();
    const section = labeledPickupSection();
    section.roles = [null, 42] as unknown as RehearsalSection["roles"];
    section.partGraph = [null, 42] as unknown as RehearsalSection["partGraph"];
    song.sections = [section];

    expect(() => resolveFirstPickupHandoff(song)).not.toThrow();
    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });
});
