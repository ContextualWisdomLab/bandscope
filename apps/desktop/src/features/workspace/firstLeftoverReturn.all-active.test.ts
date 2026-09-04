import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { hasTrustworthyAllActiveTimeline } from "./firstLeftoverReturn";

describe("hasTrustworthyAllActiveTimeline", () => {
  it("accepts a complete named timeline when every graph role stays active", () => {
    expect(hasTrustworthyAllActiveTimeline(createDemoRehearsalSong())).toBe(true);
  });

  it("rejects non-song roots and empty timelines", () => {
    expect(hasTrustworthyAllActiveTimeline(null)).toBe(false);

    const empty = createDemoRehearsalSong();
    empty.sections = [];
    expect(hasTrustworthyAllActiveTimeline(empty)).toBe(false);
  });

  it("rejects timelines without a named section", () => {
    const song = createDemoRehearsalSong();
    song.sections = song.sections.map((section) => ({ ...section, label: "   " }));

    expect(hasTrustworthyAllActiveTimeline(song)).toBe(false);
  });

  it("rejects an inactive named role", () => {
    const song = createDemoRehearsalSong();
    const firstSection = song.sections[0]!;
    firstSection.partGraph = firstSection.partGraph.map((node, index) =>
      index === 0 ? { ...node, is_active: false } : node
    );

    expect(hasTrustworthyAllActiveTimeline(song)).toBe(false);
  });

  it("fails closed on malformed section and graph evidence", () => {
    expect(
      hasTrustworthyAllActiveTimeline({ sections: [null] })
    ).toBe(false);

    const song = createDemoRehearsalSong();
    const malformed = song as unknown as {
      sections: Array<{
        partGraph: Array<Record<string, unknown>>;
      }>;
    };
    delete malformed.sections[0]!.partGraph[0]!.is_active;

    expect(hasTrustworthyAllActiveTimeline(song)).toBe(false);
  });
});
