import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstConfirmedHarmony } from "./firstConfirmedHarmony";

function songWithConfirmedHarmony() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "confirmed-own";
  section.roles = [
    {
      ...section.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "medium",
      manualOverrides: [
        {
          field: "harmony",
          value: {
            chord: "C#m11",
            functionLabel: "vi suspended lift",
            source: "user"
          },
          source: "user"
        }
      ]
    }
  ];
  section.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstConfirmedHarmony inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithConfirmedHarmony();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstConfirmedHarmony(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstConfirmedHarmony(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithConfirmedHarmony();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstConfirmedHarmony(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithConfirmedHarmony();
    Object.defineProperty(section.roles[0]!, "manualOverrides", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile manualOverrides getter");
      }
    });

    expect(() => resolveFirstConfirmedHarmony(song)).not.toThrow();
    expect(resolveFirstConfirmedHarmony(song)).toBeNull();
  });

  it("does not treat own accessors as stable confirmed-harmony identity authority", () => {
    const { song, section } = songWithConfirmedHarmony();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "confirmed-own";
      }
    });

    expect(resolveFirstConfirmedHarmony(song)).toBeNull();
  });

  it("does not let inherited overrides establish the confirmed chord", () => {
    const { song, section } = songWithConfirmedHarmony();
    const inheritedRole = Object.create({
      manualOverrides: [
        {
          field: "harmony",
          value: {
            chord: "C#m11",
            functionLabel: "Inherited confirmed chord",
            source: "user"
          },
          source: "user"
        }
      ]
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "lead-vocal" },
      name: { configurable: true, enumerable: true, value: "Lead Vocal" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "medium" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstConfirmedHarmony(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithConfirmedHarmony();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstConfirmedHarmony(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithConfirmedHarmony();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstConfirmedHarmony(song)).toBeNull();
  });
});
