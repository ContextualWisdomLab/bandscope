import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstAssignment } from "./firstAssignment";

function songWithAssignment() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "assign-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar"
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  song.collaboration = {
    syncMode: "local_only",
    syncNote: "Keep assignments local for now.",
    assignments: [
      {
        id: "assign-bass",
        assignee: "Rhythm Section",
        summary: "Lock the bass entrance against the pickup so the chorus lift lands together.",
        sectionId: "assign-own",
        roleId: "bass-guitar",
        status: "in_progress"
      }
    ],
    comments: [],
    approvals: []
  };
  return { song, section };
}

describe("resolveFirstAssignment inherited metadata", () => {
  it("rejects a song or collaboration whose required metadata is inherited", () => {
    const { song } = songWithAssignment();
    const inheritedSong = Object.create({ collaboration: song.collaboration, sections: song.sections }) as typeof song;
    expect(resolveFirstAssignment(inheritedSong)).toBeNull();

    const inheritedCollaboration = Object.create(song.collaboration!) as NonNullable<typeof song.collaboration>;
    song.collaboration = inheritedCollaboration;
    expect(resolveFirstAssignment(song)).toBeNull();
  });

  it("rejects inherited assignment fields", () => {
    const { song } = songWithAssignment();
    song.collaboration!.assignments = [
      Object.create(song.collaboration!.assignments[0]!) as (typeof song.collaboration.assignments)[number]
    ];
    expect(resolveFirstAssignment(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithAssignment();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstAssignment(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song } = songWithAssignment();
    Object.defineProperty(song.collaboration!.assignments[0]!, "summary", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile summary getter");
      }
    });

    expect(() => resolveFirstAssignment(song)).not.toThrow();
    expect(resolveFirstAssignment(song)).toBeNull();
  });

  it("does not treat own accessors as stable assignment identity authority", () => {
    const { song } = songWithAssignment();
    Object.defineProperty(song.collaboration!.assignments[0]!, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "assign-bass";
      }
    });

    expect(resolveFirstAssignment(song)).toBeNull();
  });

  it("does not let inherited section metadata host the assignment", () => {
    const { song, section } = songWithAssignment();
    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstAssignment(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithAssignment();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];

    const resolved = resolveFirstAssignment(song);
    expect(resolved?.section.id).toBe("assign-own");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Lock the bass entrance against the pickup so the chorus lift lands together.");
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithAssignment();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstAssignment(song)).toBeNull();
  });
});
