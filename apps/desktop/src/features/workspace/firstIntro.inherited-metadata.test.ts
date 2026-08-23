import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstIntro } from "./firstIntro";

function songWithIntro() {
  const song = createDemoRehearsalSong();
  const intro = structuredClone(song.sections[0]!);
  intro.id = "intro-own";
  intro.label = "intro";
  intro.timeRange = { start: 0, end: 8 };
  song.sections = [intro];
  return { song, intro };
}

describe("resolveFirstIntro inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, intro } = songWithIntro();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstIntro(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(intro) as typeof intro;
    song.sections = [inheritedSection];
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, intro } = songWithIntro();
    intro.timeRange = Object.create({ start: 0, end: 8 }) as typeof intro.timeRange;
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, intro } = songWithIntro();
    const role = intro.roles[0]!;
    const node = intro.partGraph[0]!;
    intro.roles = [Object.create(role) as typeof role];
    intro.partGraph = [Object.create(node) as typeof node];

    const resolved = resolveFirstIntro(song);
    expect(resolved?.section.id).toBe("intro-own");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, intro } = songWithIntro();
    const arraySection = Object.assign([], intro) as unknown as typeof intro;
    song.sections = [arraySection];
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("contains an own timeRange accessor that throws", () => {
    const { song, intro } = songWithIntro();
    Object.defineProperty(intro, "timeRange", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("timeRange getter must stay data");
      }
    });

    expect(() => resolveFirstIntro(song)).not.toThrow();
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("contains a nested timeRange Proxy whose descriptor trap throws", () => {
    const { song, intro } = songWithIntro();
    intro.timeRange = new Proxy(
      { start: 0, end: 8 },
      {
        getOwnPropertyDescriptor() {
          throw new Error("timeRange descriptor trap");
        }
      }
    ) as typeof intro.timeRange;

    expect(() => resolveFirstIntro(song)).not.toThrow();
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("contains a section Proxy whose descriptor trap throws", () => {
    const { song, intro } = songWithIntro();
    song.sections = [
      new Proxy(intro, {
        getOwnPropertyDescriptor() {
          throw new Error("section descriptor trap");
        }
      })
    ];

    expect(() => resolveFirstIntro(song)).not.toThrow();
    expect(resolveFirstIntro(song)).toBeNull();
  });
});
