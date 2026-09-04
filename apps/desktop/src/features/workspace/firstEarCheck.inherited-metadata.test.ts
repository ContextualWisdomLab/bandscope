import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstEarCheck } from "./firstEarCheck";

function songWithEarCheck() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "ear-check-own";
  section.confidence = {
    level: "high",
    source: "model",
    notes: "Ready to trust the form."
  };
  section.roles = [
    {
      ...section.roles[0]!,
      confidence: {
        level: "medium",
        source: "model",
        notes: "Watch the slide into the turnaround."
      }
    }
  ];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstEarCheck inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithEarCheck();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstEarCheck(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstEarCheck(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithEarCheck();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstEarCheck(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithEarCheck();
    Object.defineProperty(section.roles[0]!, "confidence", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile confidence getter");
      }
    });

    expect(() => resolveFirstEarCheck(song)).not.toThrow();
    expect(resolveFirstEarCheck(song)).toBeNull();
  });

  it("does not treat own accessors as stable ear-check identity authority", () => {
    const { song, section } = songWithEarCheck();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "ear-check-own";
      }
    });

    expect(resolveFirstEarCheck(song)).toBeNull();
  });

  it("does not let inherited confidence establish the ear check", () => {
    const { song, section } = songWithEarCheck();
    const inheritedRole = Object.create({
      confidence: {
        level: "low",
        source: "model",
        notes: "Inherited ear check"
      }
    }) as typeof section.roles[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "bass-guitar" },
      name: { configurable: true, enumerable: true, value: "Bass Guitar" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    section.confidence = {
      level: "high",
      source: "model",
      notes: "Ready to trust the form."
    };
    expect(resolveFirstEarCheck(song)).toBeNull();
  });

  it("fails the ear check closed when inherited role or graph metadata cannot prove activity", () => {
    const { song, section } = songWithEarCheck();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];

    expect(resolveFirstEarCheck(song)).toBeNull();
  });

  it("keeps a section-owned ear check band-wide without trusting inherited graph metadata", () => {
    const { song, section } = songWithEarCheck();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    section.confidence = {
      level: "medium",
      source: "model",
      notes: "Section-level notes carry tonight's guidance."
    };

    const resolved = resolveFirstEarCheck(song);

    expect(resolved?.section.id).toBe("ear-check-own");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Section-level notes carry tonight's guidance.");
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithEarCheck();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstEarCheck(song)).toBeNull();
  });
});
