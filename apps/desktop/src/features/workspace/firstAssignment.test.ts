import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong, type RehearsalAssignment } from "@bandscope/shared-types";
import { formatAssignmentTime, resolveFirstAssignment } from "./firstAssignment";

function withAssignment(
  overrides: {
    assignmentId?: string;
    sectionId?: string;
    start?: number;
    end?: number;
    summary?: string;
    assignee?: string;
    status?: RehearsalAssignment["status"];
    roleId?: string | undefined;
    roleName?: string;
    isActive?: boolean;
    label?: "intro" | "verse" | "chorus" | "bridge" | "outro" | "tag";
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  const roleId = overrides.roleId === undefined ? "bass-guitar" : overrides.roleId;
  section.id = overrides.sectionId ?? "verse-assign";
  section.label = overrides.label ?? "verse";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  section.roles = [
    {
      ...verse.roles[0]!,
      id: roleId || "bass-guitar",
      name: overrides.roleName ?? "Bass Guitar",
      rehearsalPriority: "high"
    }
  ];
  section.partGraph = [
    {
      role_id: roleId || "bass-guitar",
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [section];
  song.collaboration = {
    syncMode: "local_only",
    syncNote: "Keep assignments local for now.",
    assignments: [
      {
        id: overrides.assignmentId ?? "assign-bass",
        assignee: overrides.assignee ?? "Rhythm Section",
        summary: overrides.summary ?? "Lock the bass entrance against the pickup so the chorus lift lands together.",
        sectionId: section.id,
        ...(overrides.roleId === undefined || overrides.roleId ? { roleId: roleId || "bass-guitar" } : {}),
        status: overrides.status ?? "in_progress"
      }
    ],
    comments: [],
    approvals: []
  };
  return song;
}

describe("resolveFirstAssignment", () => {
  it("picks the demo song's in-progress assignment and the part that carries it", () => {
    const resolved = resolveFirstAssignment(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.assignment.id).toBe("assign-bass-entrance");
    expect(resolved?.assignment.assignee).toBe("Rhythm Section");
    expect(resolved?.atSeconds).toBe(10);
    expect(resolved?.hint).toBe("Lock the bass entrance against the pickup so the chorus lift lands together.");
    expect(formatAssignmentTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatAssignmentTime(Number.NaN)).toBe("0:00");
    expect(formatAssignmentTime(-4)).toBe("0:00");
  });

  it("does not invent an assignment from comments, approvals, priority, setup, cue, groove, or empty summary", () => {
    const song = withAssignment({ summary: "   " });
    song.collaboration!.comments = [
      {
        id: "comment-keys-color",
        author: "MD",
        body: "Keep the keyboard color tone gentle on the first pass so the vocal cue stays forward.",
        sectionId: song.sections[0]!.id,
        roleId: "bass-guitar",
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
    song.sections[0]!.roles[0]!.rehearsalPriority = "high";
    song.sections[0]!.roles[0]!.setupNote = "Keep the attack short so the verse breathes.";
    song.sections[0]!.roles[0]!.cue = { kind: "transition", value: "Hold through the pickup before the downbeat." };
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    expect(resolveFirstAssignment(song)).toBeNull();
  });

  it("does not treat an empty or whitespace summary as a named assignment", () => {
    expect(resolveFirstAssignment(withAssignment({ summary: "" }))).toBeNull();
    expect(resolveFirstAssignment(withAssignment({ summary: " \n\t " }))).toBeNull();
  });

  it("skips ready and blocked jobs instead of treating them as tonight's next action", () => {
    expect(resolveFirstAssignment(withAssignment({ status: "ready" }))).toBeNull();
    expect(resolveFirstAssignment(withAssignment({ status: "blocked" }))).toBeNull();
  });

  it("prefers an in-progress assignment over an earlier todo", () => {
    const song = withAssignment({
      assignmentId: "assign-late",
      start: 40,
      end: 56,
      status: "in_progress",
      summary: "Keep the chorus entrance locked."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.timeRange = { start: 8, end: 24 };
    song.sections = [song.sections[0]!, earlier];
    song.collaboration!.assignments = [
      song.collaboration!.assignments[0]!,
      {
        id: "assign-early-todo",
        assignee: "Lead Vocal",
        summary: "Confirm the verse key before the first pass.",
        sectionId: "verse-early",
        roleId: "bass-guitar",
        status: "todo"
      }
    ];

    const resolved = resolveFirstAssignment(song);
    expect(resolved?.assignment.id).toBe("assign-late");
    expect(resolved?.atSeconds).toBe(40);
  });

  it("prefers the earlier of two in-progress assignments", () => {
    const song = withAssignment({ assignmentId: "assign-late", start: 40, end: 56, summary: "Late lock." });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.timeRange = { start: 8, end: 24 };
    song.sections = [song.sections[0]!, earlier];
    song.collaboration!.assignments = [
      song.collaboration!.assignments[0]!,
      {
        id: "assign-early",
        assignee: "Rhythm Section",
        summary: "Come in on the and of four.",
        sectionId: "verse-early",
        roleId: "bass-guitar",
        status: "in_progress"
      }
    ];

    const resolved = resolveFirstAssignment(song);
    expect(resolved?.assignment.id).toBe("assign-early");
    expect(resolved?.atSeconds).toBe(8);
    expect(resolved?.hint).toBe("Come in on the and of four.");
  });

  it("breaks same-time assignment ties with locale-independent id ordering", () => {
    const song = withAssignment({ assignmentId: "ä-assign", start: 10, end: 26 });
    song.collaboration!.assignments = [
      song.collaboration!.assignments[0]!,
      {
        ...song.collaboration!.assignments[0]!,
        id: "z-assign",
        summary: "ASCII assignment"
      }
    ];

    expect(resolveFirstAssignment(song)?.assignment.id).toBe("z-assign");
  });

  it("keeps a band-wide assignment when no active ranked role carries it", () => {
    const song = withAssignment({ isActive: false });
    const resolved = resolveFirstAssignment(song);
    expect(resolved?.section.id).toBe("verse-assign");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Lock the bass entrance against the pickup so the chorus lift lands together.");
  });

  it("keeps a band-wide assignment when the job has no role pointer", () => {
    const song = withAssignment({ roleId: "" });
    delete song.collaboration!.assignments[0]!.roleId;
    const resolved = resolveFirstAssignment(song);
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.assignment.assignee).toBe("Rhythm Section");
  });

  it("skips an assignment whose rehearsal window is unbounded", () => {
    expect(resolveFirstAssignment(withAssignment({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips an assignment whose end precedes its start", () => {
    expect(resolveFirstAssignment(withAssignment({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length assignment window", () => {
    expect(resolveFirstAssignment(withAssignment({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips an assignment whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstAssignment(
        withAssignment({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstAssignment(null as never)).toBeNull();
  });

  it("returns null when the runtime assignment collection is sparse", () => {
    const song = withAssignment();
    const sparseAssignments: typeof song.collaboration.assignments = new Array(2);
    sparseAssignments[1] = song.collaboration!.assignments[0]!;
    song.collaboration!.assignments = sparseAssignments;
    expect(resolveFirstAssignment(song)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withAssignment();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstAssignment(song)).toBeNull();
  });

  it("keeps the assignment band-wide when role identities are duplicated", () => {
    const song = withAssignment();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const resolved = resolveFirstAssignment(song);
    expect(resolved?.section.id).toBe("verse-assign");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("bounds the assignment summary to 180 Unicode code points", () => {
    const song = withAssignment({ summary: `${"a".repeat(200)}` });
    const resolved = resolveFirstAssignment(song);
    expect(resolved?.hint.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the summary boundary", () => {
    const song = withAssignment({ summary: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstAssignment(song);
    expect(Array.from(resolved?.hint ?? "")).toHaveLength(180);
    expect(resolved?.hint.endsWith("😀")).toBe(true);
  });

  it("skips non-object assignments while keeping a later owned job", () => {
    const song = withAssignment();
    const valid = song.collaboration!.assignments[0]!;
    song.collaboration!.assignments = [42 as never, valid];
    const resolved = resolveFirstAssignment(song);
    expect(resolved?.assignment.id).toBe("assign-bass");
    expect(resolved?.hint).toBe("Lock the bass entrance against the pickup so the chorus lift lands together.");
  });

  it("keeps a deterministic winner when two named assignments share time and id", () => {
    const song = withAssignment({ assignmentId: "shared-id", start: 10, end: 26 });
    song.collaboration!.assignments = [
      song.collaboration!.assignments[0]!,
      structuredClone(song.collaboration!.assignments[0]!)
    ];
    expect(resolveFirstAssignment(song)).toBeNull();
  });

  it("contains throws from untrusted runtime property access", () => {
    const song = withAssignment();
    const hostile = new Proxy(song, {
      get(target, prop, receiver) {
        if (prop === "collaboration") {
          throw new Error("hostile collaboration");
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    expect(resolveFirstAssignment(hostile as typeof song)).toBeNull();
  });
});
