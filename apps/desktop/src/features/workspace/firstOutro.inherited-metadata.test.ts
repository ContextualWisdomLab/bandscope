import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstOutro } from "./firstOutro";

function songWithOutro() {
  const song = createDemoRehearsalSong();
  const outro = structuredClone(song.sections[0]!);
  outro.id = "outro-own";
  outro.label = "outro";
  outro.timeRange = { start: 180, end: 196 };
  song.sections = [outro];
  return { song, outro };
}

describe("resolveFirstOutro inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, outro } = songWithOutro();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstOutro(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(outro) as typeof outro;
    song.sections = [inheritedSection];
    expect(resolveFirstOutro(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, outro } = songWithOutro();
    outro.timeRange = Object.create({ start: 180, end: 196 }) as typeof outro.timeRange;
    expect(resolveFirstOutro(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, outro } = songWithOutro();
    const role = outro.roles[0]!;
    const node = outro.partGraph[0]!;
    outro.roles = [Object.create(role) as typeof role];
    outro.partGraph = [Object.create(node) as typeof node];

    const resolved = resolveFirstOutro(song);
    expect(resolved?.section.id).toBe("outro-own");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, outro } = songWithOutro();
    const arraySection = Object.assign([], outro) as unknown as typeof outro;
    song.sections = [arraySection];
    expect(resolveFirstOutro(song)).toBeNull();
  });
});
