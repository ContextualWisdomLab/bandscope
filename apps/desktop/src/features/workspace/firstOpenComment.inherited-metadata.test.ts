import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstOpenComment } from "./firstOpenComment";

function songWithOpenComment() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "comment-own";
  song.sections = [section];
  song.collaboration = {
    syncMode: "local_only",
    syncNote: "Keep assignments local for now.",
    assignments: [],
    approvals: [],
    comments: [
      {
        id: "comment-keys-color",
        author: "MD",
        body: "Keep the keyboard color tone gentle on the first pass so the vocal cue stays forward.",
        sectionId: "comment-own",
        roleId: "keys-right",
        status: "open"
      }
    ]
  };
  return { song, section };
}

describe("resolveFirstOpenComment inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithOpenComment();
    const inheritedSong = Object.create({
      sections: song.sections,
      collaboration: song.collaboration
    }) as typeof song;
    expect(resolveFirstOpenComment(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstOpenComment(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithOpenComment();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstOpenComment(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song } = songWithOpenComment();
    Object.defineProperty(song.collaboration!.comments[0]!, "body", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile comment body getter");
      }
    });

    expect(() => resolveFirstOpenComment(song)).not.toThrow();
    expect(resolveFirstOpenComment(song)).toBeNull();
  });

  it("does not treat own accessors as stable comment identity authority", () => {
    const { song } = songWithOpenComment();
    Object.defineProperty(song.collaboration!.comments[0]!, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "comment-keys-color";
      }
    });

    expect(resolveFirstOpenComment(song)).toBeNull();
  });

  it("does not let inherited comment metadata establish the note", () => {
    const { song } = songWithOpenComment();
    song.collaboration!.comments = [
      Object.create({
        id: "comment-keys-color",
        author: "MD",
        body: "Inherited note",
        sectionId: "comment-own",
        roleId: "keys-right",
        status: "open"
      }) as (typeof song.collaboration.comments)[number]
    ];
    expect(resolveFirstOpenComment(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithOpenComment();
    const node = section.partGraph.find((item) => item.role_id === "keys-right")!;
    section.partGraph = [Object.create(node) as typeof node];

    const resolved = resolveFirstOpenComment(song);
    expect(resolved?.section.id).toBe("comment-own");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe(
      "Keep the keyboard color tone gentle on the first pass so the vocal cue stays forward."
    );
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithOpenComment();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstOpenComment(song)).toBeNull();
  });
});
