import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTag } from "./firstTag";

function songWithTag() {
  const song = createDemoRehearsalSong();
  const tag = structuredClone(song.sections[0]!);
  tag.id = "tag-own";
  tag.label = "tag";
  tag.timeRange = { start: 200, end: 208 };
  song.sections = [tag];
  return { song, tag };
}

describe("resolveFirstTag inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, tag } = songWithTag();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstTag(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(tag) as typeof tag;
    song.sections = [inheritedSection];
    expect(resolveFirstTag(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, tag } = songWithTag();
    tag.timeRange = Object.create({ start: 200, end: 208 }) as typeof tag.timeRange;
    expect(resolveFirstTag(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, tag } = songWithTag();
    const role = tag.roles[0]!;
    const node = tag.partGraph[0]!;
    tag.roles = [Object.create(role) as typeof role];
    tag.partGraph = [Object.create(node) as typeof node];

    const resolved = resolveFirstTag(song);
    expect(resolved?.section.id).toBe("tag-own");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, tag } = songWithTag();
    const arraySection = Object.assign([], tag) as unknown as typeof tag;
    song.sections = [arraySection];
    expect(resolveFirstTag(song)).toBeNull();
  });
});
