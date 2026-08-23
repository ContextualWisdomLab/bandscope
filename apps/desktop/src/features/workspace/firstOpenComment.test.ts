import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatOpenCommentTime, resolveFirstOpenComment } from "./firstOpenComment";

function withOpenComment(
  overrides: {
    commentId?: string;
    sectionId?: string;
    start?: number;
    end?: number;
    label?: "intro" | "verse" | "chorus" | "bridge" | "outro" | "tag";
    roleId?: string;
    roleName?: string;
    author?: string;
    body?: string;
    status?: "open" | "resolved";
    isActive?: boolean;
    includeRoleId?: boolean;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.sectionId ?? "verse-note";
  section.label = overrides.label ?? "verse";
  section.groove = "Straight eighths with a late snare feel";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  const roleId = overrides.roleId ?? "keys-right";
  section.roles = [
    {
      ...verse.roles[1]!,
      id: roleId,
      name: overrides.roleName ?? "Keyboard 1 Right Hand",
      rehearsalPriority: "high",
      cue: { kind: "count", value: "Enter on beat 2 after the pickup." },
      overlapWarnings: [],
      setupNote: "Keep the patch bright enough to stay over the guitars.",
      simplification: "Drop the top extension if the chorus turnaround still feels busy."
    }
  ];
  section.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [section];
  song.collaboration = {
    syncMode: "local_only",
    syncNote: "Keep assignments local for now.",
    assignments: [],
    approvals: [],
    comments: [
      {
        id: overrides.commentId ?? "comment-keys-color",
        author: overrides.author ?? "MD",
        body: overrides.body ?? "Keep the keyboard color tone gentle on the first pass so the vocal cue stays forward.",
        sectionId: section.id,
        ...(overrides.includeRoleId === false ? {} : { roleId }),
        status: overrides.status ?? "open"
      }
    ]
  };
  return song;
}

describe("resolveFirstOpenComment", () => {
  it("picks the demo song's earliest open note and the part it names", () => {
    const resolved = resolveFirstOpenComment(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole?.id).toBe("keys-right");
    expect(resolved?.comment.id).toBe("comment-keys-color");
    expect(resolved?.atSeconds).toBe(10);
    expect(resolved?.author).toBe("MD");
    expect(resolved?.hint).toBe(
      "Keep the keyboard color tone gentle on the first pass so the vocal cue stays forward."
    );
    expect(formatOpenCommentTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatOpenCommentTime(Number.NaN)).toBe("0:00");
    expect(formatOpenCommentTime(-4)).toBe("0:00");
  });

  it("does not invent an open note from resolved comments, assignments, approvals, cues, groove, setup, simplification, overlap, or range copy", () => {
    const song = withOpenComment({ status: "resolved" });
    song.collaboration!.assignments = [
      {
        id: "assign-bass-entrance",
        assignee: "Rhythm Section",
        summary: "Lock the bass entrance against the pickup so the chorus lift lands together.",
        sectionId: song.sections[0]!.id,
        roleId: "keys-right",
        status: "in_progress"
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
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.setupNote = "Keep the patch bright enough to stay over the guitars.";
    song.sections[0]!.roles[0]!.simplification = "Drop the top extension if the chorus turnaround still feels busy.";
    song.sections[0]!.roles[0]!.cue = { kind: "lyric", value: "city lights" };
    song.sections[0]!.roles[0]!.overlapWarnings = [
      "Melodic overlap: top notes conflict with Lead Vocal range."
    ];
    song.sections[0]!.roles[0]!.range = { lowestNote: "B3", highestNote: "G#5" };
    expect(resolveFirstOpenComment(song)).toBeNull();
  });

  it("does not treat an empty or whitespace comment body as a named note", () => {
    expect(resolveFirstOpenComment(withOpenComment({ body: "" }))).toBeNull();
    expect(resolveFirstOpenComment(withOpenComment({ body: " \n\t " }))).toBeNull();
  });

  it("prefers the earlier of two open notes", () => {
    const song = withOpenComment({ commentId: "comment-late", start: 40, end: 56, roleId: "lead-vocal" });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.timeRange = { start: 8, end: 24 };
    song.sections = [song.sections[0]!, earlier];
    song.collaboration!.comments = [
      song.collaboration!.comments[0]!,
      {
        id: "comment-early",
        author: "MD",
        body: "Catch the pickup before the downbeat.",
        sectionId: "verse-early",
        roleId: "keys-right",
        status: "open"
      }
    ];

    const resolved = resolveFirstOpenComment(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.comment.id).toBe("comment-early");
    expect(resolved?.hint).toBe("Catch the pickup before the downbeat.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time comment ties with locale-independent id ordering", () => {
    const song = withOpenComment({ commentId: "ä-note", start: 10, end: 26 });
    song.collaboration!.comments = [
      song.collaboration!.comments[0]!,
      {
        ...song.collaboration!.comments[0]!,
        id: "z-note",
        body: "ASCII note"
      }
    ];

    expect(resolveFirstOpenComment(song)?.comment.id).toBe("z-note");
  });

  it("keeps a section-wide note when no active ranked role carries it", () => {
    const song = withOpenComment({ isActive: false });
    const resolved = resolveFirstOpenComment(song);
    expect(resolved?.section.id).toBe("verse-note");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe(
      "Keep the keyboard color tone gentle on the first pass so the vocal cue stays forward."
    );
  });

  it("keeps a section-wide note when the comment does not name a part", () => {
    const song = withOpenComment({ includeRoleId: false });
    const resolved = resolveFirstOpenComment(song);
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.author).toBe("MD");
  });

  it("skips a note whose rehearsal window is unbounded", () => {
    expect(resolveFirstOpenComment(withOpenComment({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a note whose end precedes its start", () => {
    expect(resolveFirstOpenComment(withOpenComment({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length note window", () => {
    expect(resolveFirstOpenComment(withOpenComment({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a note whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstOpenComment(
        withOpenComment({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstOpenComment(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withOpenComment();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstOpenComment(song)).toBeNull();
  });

  it("keeps the note section-wide when role identities are duplicated", () => {
    const song = withOpenComment();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const resolved = resolveFirstOpenComment(song);
    expect(resolved?.section.id).toBe("verse-note");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("bounds the comment body to 180 Unicode code points", () => {
    const song = withOpenComment({ body: `${"a".repeat(200)}` });
    const resolved = resolveFirstOpenComment(song);
    expect(resolved?.hint.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the hint boundary", () => {
    const song = withOpenComment({ body: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstOpenComment(song);
    expect(Array.from(resolved?.hint ?? "")).toHaveLength(180);
    expect(resolved?.hint.endsWith("😀")).toBe(true);
  });

  it("skips a comment whose author is empty", () => {
    expect(resolveFirstOpenComment(withOpenComment({ author: "   " }))).toBeNull();
  });

  it("contains throws from untrusted runtime property access", () => {
    const song = withOpenComment();
    const hostile = new Proxy(song, {
      get(target, prop, receiver) {
        if (prop === "collaboration") {
          throw new Error("hostile collaboration");
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    expect(resolveFirstOpenComment(hostile as typeof song)).toBeNull();
  });
});
