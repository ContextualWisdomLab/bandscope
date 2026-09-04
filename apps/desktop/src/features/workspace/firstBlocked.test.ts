import { describe, expect, it } from "vitest";
import {
  createDemoRehearsalSong,
  type RehearsalAssignment,
  type SectionFormLabel
} from "@bandscope/shared-types";
import { formatBlockedTime, resolveFirstBlockedAssignment } from "./firstBlocked";

function withBlocked(
  overrides: {
    assignmentId?: string;
    summary?: string;
    assignee?: string;
    status?: RehearsalAssignment["status"];
    sectionId?: string;
    start?: number;
    end?: number;
    label?: SectionFormLabel;
    roleId?: string | undefined;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.sectionId ?? "verse-blocked";
  section.label = overrides.label ?? "verse";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  song.sections = [section];
  song.collaboration = {
    syncMode: "local_only",
    syncNote: "Keep blocked jobs local for now.",
    assignments: [
      {
        id: overrides.assignmentId ?? "assign-keys-blocked",
        assignee: overrides.assignee ?? "Keys",
        summary: overrides.summary ?? "Wait on the in-ear mix before the verse color pass.",
        sectionId: section.id,
        roleId: overrides.roleId === undefined ? "keys-right" : overrides.roleId,
        status: overrides.status ?? "blocked"
      }
    ],
    comments: [],
    approvals: []
  };
  if (overrides.roleId === undefined) {
    return song;
  }
  if (overrides.roleId === "") {
    delete song.collaboration.assignments[0]!.roleId;
  }
  return song;
}

describe("resolveFirstBlockedAssignment", () => {
  it("does not invent a blocked job from the demo in-progress or todo assignments", () => {
    expect(resolveFirstBlockedAssignment(createDemoRehearsalSong())).toBeNull();
  });

  it("picks the earliest owned blocked assignment and its unique section", () => {
    const resolved = resolveFirstBlockedAssignment(withBlocked());
    expect(resolved?.assignment.id).toBe("assign-keys-blocked");
    expect(resolved?.assignment.assignee).toBe("Keys");
    expect(resolved?.hint).toBe("Wait on the in-ear mix before the verse color pass.");
    expect(resolved?.section.id).toBe("verse-blocked");
    expect(resolved?.holdingRole?.id).toBe("keys-right");
    expect(resolved?.atSeconds).toBe(10);
    expect(formatBlockedTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatBlockedTime(Number.NaN)).toBe("0:00");
    expect(formatBlockedTime(-4)).toBe("0:00");
  });

  it("does not invent a blocked job from todo, in_progress, ready, comments, or approvals", () => {
    const song = withBlocked({ status: "todo" });
    song.collaboration!.assignments = [
      {
        id: "assign-bass-entrance",
        assignee: "Rhythm Section",
        summary: "Lock the bass entrance against the pickup so the chorus lift lands together.",
        sectionId: song.sections[0]!.id,
        roleId: "bass-guitar",
        status: "in_progress"
      },
      {
        id: "assign-vocal-ready",
        assignee: "Lead Vocal",
        summary: "Verse key decision is ready for the first pass.",
        sectionId: song.sections[0]!.id,
        roleId: "lead-vocal",
        status: "ready"
      },
      song.collaboration!.assignments[0]!
    ];
    song.collaboration!.comments = [
      {
        id: "comment-keys-color",
        author: "MD",
        body: "Keep the keyboard color tone gentle on the first pass so the vocal cue stays forward.",
        sectionId: song.sections[0]!.id,
        roleId: "keys-right",
        status: "open"
      }
    ];
    song.collaboration!.approvals = [
      {
        id: "approval-harmony-pass",
        scope: "Verse harmony pass",
        owner: "MD",
        status: "pending"
      }
    ];
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("does not treat an empty or whitespace summary as a named blocked job", () => {
    expect(resolveFirstBlockedAssignment(withBlocked({ summary: "" }))).toBeNull();
    expect(resolveFirstBlockedAssignment(withBlocked({ summary: " \n\t " }))).toBeNull();
  });

  it("prefers the earlier of two blocked jobs", () => {
    const song = withBlocked({
      assignmentId: "assign-late",
      start: 40,
      end: 56,
      label: "chorus",
      summary: "Chorus lift is waiting on the in-ear mix."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.label = "verse";
    earlier.timeRange = { start: 8, end: 24 };
    song.sections = [song.sections[0]!, earlier];
    song.collaboration!.assignments = [
      song.collaboration!.assignments[0]!,
      {
        id: "assign-early",
        assignee: "Rhythm Section",
        summary: "Bass entrance is waiting on the click.",
        sectionId: "verse-early",
        roleId: "bass-guitar",
        status: "blocked"
      }
    ];

    const resolved = resolveFirstBlockedAssignment(song);
    expect(resolved?.assignment.id).toBe("assign-early");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("keeps the blocked job band-wide when the holding role is missing", () => {
    const resolved = resolveFirstBlockedAssignment(withBlocked({ roleId: "" }));
    expect(resolved?.assignment.id).toBe("assign-keys-blocked");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.section.id).toBe("verse-blocked");
  });

  it("does not invent a section from a missing or duplicated section pointer", () => {
    const missing = withBlocked();
    missing.collaboration!.assignments[0]!.sectionId = "missing-section";
    expect(resolveFirstBlockedAssignment(missing)).toBeNull();

    const song = withBlocked();
    const duplicate = structuredClone(song.sections[0]!);
    duplicate.timeRange = { start: 40, end: 56 };
    song.sections = [song.sections[0]!, duplicate];
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("bounds a long owned summary without splitting a surrogate pair", () => {
    const song = withBlocked({
      summary: `${"a".repeat(179)}\uD83D\uDE80trailing`
    });
    expect(resolveFirstBlockedAssignment(song)?.hint).toBe(`${"a".repeat(179)}\uD83D\uDE80`);
  });

  it("ties equal blocked times with a stable id", () => {
    const song = withBlocked({ assignmentId: "z-late", summary: "Later blocked mix." });
    song.collaboration!.assignments = [
      song.collaboration!.assignments[0]!,
      {
        id: "a-early",
        assignee: "MD",
        summary: "Earlier blocked mix.",
        sectionId: song.sections[0]!.id,
        roleId: "keys-right",
        status: "blocked"
      }
    ];
    expect(resolveFirstBlockedAssignment(song)?.assignment.id).toBe("a-early");
  });

  it("orders equal-time blocked jobs in both id directions", () => {
    const song = withBlocked({ assignmentId: "m-mid", start: 12, end: 28, summary: "Middle blocked mix." });
    song.collaboration!.assignments = [
      {
        id: "z-late",
        assignee: "MD",
        summary: "Later blocked mix.",
        sectionId: song.sections[0]!.id,
        roleId: "keys-right",
        status: "blocked"
      },
      song.collaboration!.assignments[0]!,
      {
        id: "a-early",
        assignee: "Rhythm Section",
        summary: "Earlier blocked mix.",
        sectionId: song.sections[0]!.id,
        roleId: "bass-guitar",
        status: "blocked"
      }
    ];
    expect(resolveFirstBlockedAssignment(song)?.assignment.id).toBe("a-early");
  });

  it("keeps the blocked job band-wide when role identities are duplicated", () => {
    const song = withBlocked();
    const role = song.sections[0]!.roles.find((item) => item.id === "keys-right") ?? song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const resolved = resolveFirstBlockedAssignment(song);
    expect(resolved?.assignment.id).toBe("assign-keys-blocked");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("keeps the blocked job band-wide when the holding role is whitespace", () => {
    const resolved = resolveFirstBlockedAssignment(withBlocked({ roleId: "   " }));
    expect(resolved?.assignment.id).toBe("assign-keys-blocked");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("keeps the blocked job band-wide when role or graph collections are missing", () => {
    const song = withBlocked();
    delete (song.sections[0] as { roles?: unknown }).roles;
    expect(resolveFirstBlockedAssignment(song)?.holdingRole).toBeNull();

    const graphMissing = withBlocked();
    delete (graphMissing.sections[0] as { partGraph?: unknown }).partGraph;
    expect(resolveFirstBlockedAssignment(graphMissing)?.holdingRole).toBeNull();
  });

  it("does not invent a blocked job when the unique section has no owned time range", () => {
    const song = withBlocked();
    delete (song.sections[0] as { timeRange?: unknown }).timeRange;
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("does not invent a blocked job when sections are missing, sparse, or not an array", () => {
    const missing = withBlocked();
    delete (missing as { sections?: unknown }).sections;
    expect(resolveFirstBlockedAssignment(missing)).toBeNull();

    const sparse = withBlocked();
    const sparseSections: typeof sparse.sections = [];
    sparseSections[1] = sparse.sections[0]!;
    sparse.sections = sparseSections;
    expect(resolveFirstBlockedAssignment(sparse)).toBeNull();

    const masquerade = withBlocked();
    masquerade.sections = { length: 1, 0: masquerade.sections[0]! } as unknown as typeof masquerade.sections;
    expect(resolveFirstBlockedAssignment(masquerade)).toBeNull();
  });

  it("does not invent a blocked job when a dense array reports a non-integer length", () => {
    const song = withBlocked();
    const target = song.sections[0]!;
    song.sections = new Proxy([target], {
      get(record, property, receiver) {
        if (property === "length") {
          return 1.5;
        }
        return Reflect.get(record, property, receiver);
      }
    }) as typeof song.sections;
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("skips non-object assignments while keeping a later owned blocked job", () => {
    const song = withBlocked();
    const valid = song.collaboration!.assignments[0]!;
    song.collaboration!.assignments = [42 as never, valid];
    expect(resolveFirstBlockedAssignment(song)?.assignment.id).toBe("assign-keys-blocked");
  });

  it("does not invent a blocked job from duplicated assignment identities", () => {
    const song = withBlocked({ assignmentId: "shared-id" });
    song.collaboration!.assignments = [
      song.collaboration!.assignments[0]!,
      structuredClone(song.collaboration!.assignments[0]!),
      structuredClone(song.collaboration!.assignments[0]!)
    ];
    expect(resolveFirstBlockedAssignment(song)).toBeNull();
  });

  it("contains throws from untrusted runtime property access", () => {
    const song = withBlocked();
    const hostile = new Proxy(song, {
      get(target, prop, receiver) {
        if (prop === "collaboration") {
          throw new Error("hostile collaboration");
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    expect(resolveFirstBlockedAssignment(hostile as typeof song)).toBeNull();
  });
});
