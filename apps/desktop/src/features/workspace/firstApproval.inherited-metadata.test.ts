import { createDemoRehearsalSong, type RehearsalApproval } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstApproval } from "./firstApproval";

function songWithApproval() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "approve-own";
  song.sections = [section];
  song.collaboration = {
    syncMode: "local_only",
    syncNote: "Keep approvals local for now.",
    assignments: [],
    comments: [],
    approvals: [
      {
        id: "approval-harmony-pass",
        scope: "Verse harmony pass",
        owner: "MD",
        status: "pending"
      }
    ]
  };
  return { song, section };
}

describe("resolveFirstApproval inherited metadata", () => {
  it("rejects a song or collaboration whose required metadata is inherited", () => {
    const { song } = songWithApproval();
    const inheritedSong = Object.create({ collaboration: song.collaboration, sections: song.sections }) as typeof song;
    expect(resolveFirstApproval(inheritedSong)).toBeNull();

    const inheritedCollaboration = Object.create(song.collaboration!) as NonNullable<typeof song.collaboration>;
    song.collaboration = inheritedCollaboration;
    expect(resolveFirstApproval(song)).toBeNull();
  });

  it("rejects inherited approval fields", () => {
    const { song } = songWithApproval();
    song.collaboration!.approvals = [
      Object.create(song.collaboration!.approvals[0]!) as (typeof song.collaboration.approvals)[number]
    ];
    expect(resolveFirstApproval(song)).toBeNull();
  });

  it("rejects inherited timing fields when a unique section is required", () => {
    const { song, section } = songWithApproval();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    const resolved = resolveFirstApproval(song);
    expect(resolved?.approval.id).toBe("approval-harmony-pass");
    expect(resolved?.section).toBeNull();
    expect(resolved?.atSeconds).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song } = songWithApproval();
    Object.defineProperty(song.collaboration!.approvals[0]!, "scope", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile scope getter");
      }
    });

    expect(() => resolveFirstApproval(song)).not.toThrow();
    expect(resolveFirstApproval(song)).toBeNull();
  });

  it("does not treat own accessors as stable approval identity authority", () => {
    const { song } = songWithApproval();
    Object.defineProperty(song.collaboration!.approvals[0]!, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "approval-harmony-pass";
      }
    });

    expect(resolveFirstApproval(song)).toBeNull();
  });

  it("does not let inherited section metadata host the approval", () => {
    const { song, section } = songWithApproval();
    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    const resolved = resolveFirstApproval(song);
    expect(resolved?.approval.id).toBe("approval-harmony-pass");
    expect(resolved?.section).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithApproval();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    const resolved = resolveFirstApproval(song);
    expect(resolved?.approval.id).toBe("approval-harmony-pass");
    expect(resolved?.section).toBeNull();
  });

  it("rejects sparse approval arrays", () => {
    const { song } = songWithApproval();
    const sparse: RehearsalApproval[] = [];
    sparse[1] = song.collaboration!.approvals[0]!;
    song.collaboration!.approvals = sparse;
    expect(resolveFirstApproval(song)).toBeNull();
  });
});
