import { describe, expect, it } from "vitest";
import {
  createDemoRehearsalSong,
  type RehearsalApproval,
  type SectionFormLabel
} from "@bandscope/shared-types";
import { formatApprovalTime, resolveFirstApproval } from "./firstApproval";

function withApproval(
  overrides: {
    approvalId?: string;
    scope?: string;
    owner?: string;
    status?: RehearsalApproval["status"];
    sectionId?: string;
    start?: number;
    end?: number;
    label?: SectionFormLabel;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.sectionId ?? "verse-approve";
  section.label = overrides.label ?? "verse";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  song.sections = [section];
  song.collaboration = {
    syncMode: "local_only",
    syncNote: "Keep approvals local for now.",
    assignments: [],
    comments: [],
    approvals: [
      {
        id: overrides.approvalId ?? "approval-harmony-pass",
        scope: overrides.scope ?? "Verse harmony pass",
        owner: overrides.owner ?? "MD",
        status: overrides.status ?? "pending"
      }
    ]
  };
  return song;
}

describe("resolveFirstApproval", () => {
  it("picks the demo song's pending verse harmony sign-off", () => {
    const resolved = resolveFirstApproval(createDemoRehearsalSong());
    expect(resolved?.approval.id).toBe("approval-harmony-pass");
    expect(resolved?.approval.owner).toBe("MD");
    expect(resolved?.scope).toBe("Verse harmony pass");
    expect(resolved?.section?.id).toBe("verse-1");
    expect(resolved?.atSeconds).toBe(10);
    expect(formatApprovalTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatApprovalTime(Number.NaN)).toBe("0:00");
    expect(formatApprovalTime(-4)).toBe("0:00");
  });

  it("does not invent an approval from assignments, comments, approved scopes, or empty scope", () => {
    const song = withApproval({ scope: "   " });
    song.collaboration!.assignments = [
      {
        id: "assign-bass-entrance",
        assignee: "Rhythm Section",
        summary: "Lock the bass entrance against the pickup so the chorus lift lands together.",
        sectionId: song.sections[0]!.id,
        roleId: "bass-guitar",
        status: "in_progress"
      }
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
        id: "approval-vocal-shape",
        scope: "Lead vocal simplification",
        owner: "Lead Vocal",
        status: "approved"
      }
    ];
    expect(resolveFirstApproval(song)).toBeNull();
  });

  it("does not treat an empty or whitespace scope as a named approval", () => {
    expect(resolveFirstApproval(withApproval({ scope: "" }))).toBeNull();
    expect(resolveFirstApproval(withApproval({ scope: " \n\t " }))).toBeNull();
  });

  it("skips already-approved scopes instead of treating them as tonight's next action", () => {
    expect(resolveFirstApproval(withApproval({ status: "approved" }))).toBeNull();
  });

  it("prefers a changes-requested approval over an earlier pending one", () => {
    const song = withApproval({
      approvalId: "approval-late",
      start: 40,
      end: 56,
      label: "chorus",
      status: "changes_requested",
      scope: "Chorus lift pass"
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.label = "verse";
    earlier.timeRange = { start: 8, end: 24 };
    song.sections = [song.sections[0]!, earlier];
    song.collaboration!.approvals = [
      song.collaboration!.approvals[0]!,
      {
        id: "approval-early-pending",
        scope: "Verse harmony pass",
        owner: "Lead Vocal",
        status: "pending"
      }
    ];

    const resolved = resolveFirstApproval(song);
    expect(resolved?.approval.id).toBe("approval-late");
    expect(resolved?.atSeconds).toBe(40);
  });

  it("prefers the earlier of two pending approvals", () => {
    const song = withApproval({
      approvalId: "approval-late",
      start: 40,
      end: 56,
      label: "chorus",
      scope: "Chorus lift pass"
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.label = "verse";
    earlier.timeRange = { start: 8, end: 24 };
    song.sections = [song.sections[0]!, earlier];
    song.collaboration!.approvals = [
      song.collaboration!.approvals[0]!,
      {
        id: "approval-early",
        scope: "Verse harmony pass",
        owner: "Lead Vocal",
        status: "pending"
      }
    ];

    const resolved = resolveFirstApproval(song);
    expect(resolved?.approval.id).toBe("approval-early");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("does not invent a section from chorus when the scope names pre-chorus", () => {
    const song = withApproval({
      scope: "Pre-chorus lift pass",
      label: "pre-chorus",
      start: 24,
      end: 32
    });
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 56 };
    song.sections = [song.sections[0]!, chorus];

    const resolved = resolveFirstApproval(song);
    expect(resolved?.section?.id).toBe("verse-approve");
    expect(resolved?.section?.label).toBe("pre-chorus");
    expect(resolved?.atSeconds).toBe(24);
  });

  it("keeps the approval band-wide when two verse sections share the named form", () => {
    const song = withApproval({ scope: "Verse harmony pass" });
    const second = structuredClone(song.sections[0]!);
    second.id = "verse-2";
    second.timeRange = { start: 40, end: 56 };
    song.sections = [song.sections[0]!, second];

    const resolved = resolveFirstApproval(song);
    expect(resolved?.approval.id).toBe("approval-harmony-pass");
    expect(resolved?.section).toBeNull();
    expect(resolved?.atSeconds).toBeNull();
  });

  it("does not invent a section from assignments, comments, or Korean scope tokens", () => {
    const song = withApproval({ scope: "벌스 화성 패스" });
    expect(resolveFirstApproval(song)?.section).toBeNull();
    expect(resolveFirstApproval(song)?.scope).toBe("벌스 화성 패스");
  });

  it("bounds a long owned scope without splitting a surrogate pair", () => {
    const song = withApproval({
      scope: `${"a".repeat(179)}\uD83D\uDE80trailing`
    });
    expect(resolveFirstApproval(song)?.scope).toBe(`${"a".repeat(179)}\uD83D\uDE80`);
  });

  it("ties equal pending times with a stable id", () => {
    const song = withApproval({ approvalId: "z-late", scope: "Verse later pass" });
    song.collaboration!.approvals = [
      song.collaboration!.approvals[0]!,
      {
        id: "a-early",
        scope: "Verse earlier pass",
        owner: "MD",
        status: "pending"
      }
    ];
    expect(resolveFirstApproval(song)?.approval.id).toBe("a-early");
  });
});
