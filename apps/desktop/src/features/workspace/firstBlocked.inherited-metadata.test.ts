import { createDemoRehearsalSong, type RehearsalAssignment } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstBlockedAssignment } from "./firstBlocked";

function songWithBlocked() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "block-own";
  song.sections = [section];
  song.collaboration = {
    syncMode: "local_only",
    syncNote: "Keep blocked jobs local for now.",
    assignments: [
      {
        id: "assign-keys-blocked",
        assignee: "Keys",
        summary: "Wait on the in-ear mix before the verse color pass.",
        sectionId: "block-own",
        roleId: "keys-right",
        status: "blocked"
      }
    ],
    comments: [],
    approvals: []
  };
  return { song, section };
}

describe("resolveFirstBlockedAssignment inherited metadata", () => {
  it("rejects a song or collaboration whose required metadata is inherited", () => {
    const { song } = songWithBlocked();
    const inheritedSong = Object.create({
      collaboration: song.collaboration,
      sections: song.sections
    }) as typeof song;
    expect(resolveFirstBlockedAssignment(inheritedSong)).toBeNull();

    const inheritedCollaboration = Object.create(song.collaboration!) as NonNullable<
      typeof song.collaboration
    >;
    song.collaboration = inheritedCollaboration;
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("rejects inherited assignment fields", () => {
    const { song } = songWithBlocked();
    song.collaboration!.assignments = [
      Object.create(song.collaboration!.assignments[0]!) as (typeof song.collaboration.assignments)[number]
    ];
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("rejects inherited timing fields when a unique section is required", () => {
    const { song, section } = songWithBlocked();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song } = songWithBlocked();
    Object.defineProperty(song.collaboration!.assignments[0]!, "summary", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile summary getter");
      }
    });

    expect(() => resolveFirstBlockedAssignment(song)).not.toThrow();
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("does not treat own accessors as stable blocked identity authority", () => {
    const { song } = songWithBlocked();
    Object.defineProperty(song.collaboration!.assignments[0]!, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "assign-keys-blocked";
      }
    });

    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("does not let inherited section metadata host the blocked job", () => {
    const { song, section } = songWithBlocked();
    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithBlocked();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("rejects sparse assignment arrays", () => {
    const { song } = songWithBlocked();
    const sparse: RehearsalAssignment[] = [];
    sparse[1] = song.collaboration!.assignments[0]!;
    song.collaboration!.assignments = sparse;
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });
});
