import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatTagTime, resolveFirstTag } from "./firstTag";

function withTagSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const tag = structuredClone(verse);
  tag.id = overrides.id ?? "tag-1";
  tag.label = "tag";
  tag.timeRange = { start: overrides.start ?? 200, end: overrides.end ?? 208 };
  const roleId = overrides.roleId ?? "lead-vocal";
  tag.roles = [
    {
      ...verse.roles[0]!,
      id: roleId,
      name: overrides.roleName ?? "Lead Vocal",
      rehearsalPriority: overrides.priority ?? "high"
    }
  ];
  tag.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, tag];
  return song;
}

describe("resolveFirstTag", () => {
  it("returns null when the demo song has no labeled tag", () => {
    expect(resolveFirstTag(createDemoRehearsalSong())).toBeNull();
    expect(formatTagTime(Number.NaN)).toBe("0:00");
    expect(formatTagTime(-4)).toBe("0:00");
  });

  it("does not invent a tag from a verse, chorus, intro, outro, pickup, stop, or handoff", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const chorus = structuredClone(verse);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 30, end: 46 };
    const intro = structuredClone(verse);
    intro.id = "intro-1";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: 8 };
    const outro = structuredClone(verse);
    outro.id = "outro-1";
    outro.label = "outro";
    outro.timeRange = { start: 180, end: 196 };
    const pickup = structuredClone(verse);
    pickup.id = "pickup-1";
    pickup.label = "pickup";
    pickup.timeRange = { start: 8, end: 10 };
    const stop = structuredClone(verse);
    stop.id = "stop-1";
    stop.label = "stop";
    stop.timeRange = { start: 18, end: 19 };
    const handoff = structuredClone(verse);
    handoff.id = "handoff-1";
    handoff.label = "handoff";
    handoff.timeRange = { start: 22, end: 24 };
    song.sections = [intro, verse, pickup, stop, chorus, handoff, outro];

    expect(resolveFirstTag(song)).toBeNull();
  });

  it("does not treat the last unlabeled section as a tag", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = { start: 200, end: 208 };
    expect(song.sections[0]!.label).toBe("verse");
    expect(resolveFirstTag(song)).toBeNull();
  });

  it("picks the earliest labeled tag and the part that holds it", () => {
    const song = withTagSection({ start: 200, end: 208 });
    const tag = resolveFirstTag(song);

    expect(tag?.section.id).toBe("tag-1");
    expect(tag?.holdingRole?.id).toBe("lead-vocal");
    expect(tag?.atSeconds).toBe(200);
    expect(formatTagTime(tag?.atSeconds ?? -1)).toBe("3:20");
  });

  it("prefers the earlier of two labeled tags", () => {
    const song = withTagSection({ id: "tag-late", start: 220, end: 228 });
    const verse = song.sections[0]!;
    const earlier = structuredClone(song.sections[1]!);
    earlier.id = "tag-early";
    earlier.timeRange = { start: 200, end: 208 };
    earlier.roles = [
      {
        ...verse.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "medium"
      }
    ];
    earlier.partGraph = [
      {
        role_id: "bass-guitar",
        is_active: true,
        handoff_to: [],
        handoff_from: []
      }
    ];
    song.sections = [song.sections[0]!, song.sections[1]!, earlier];

    const tag = resolveFirstTag(song);
    expect(tag?.section.id).toBe("tag-early");
    expect(tag?.holdingRole?.id).toBe("bass-guitar");
    expect(tag?.atSeconds).toBe(200);
  });

  it("breaks same-time tag ties with locale-independent id ordering", () => {
    const song = withTagSection({ id: "ä-tag", start: 200, end: 208 });
    const asciiTag = structuredClone(song.sections[1]!);
    asciiTag.id = "z-tag";
    song.sections = [song.sections[0]!, song.sections[1]!, asciiTag];

    expect(resolveFirstTag(song)?.section.id).toBe("z-tag");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withTagSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const tag = song.sections[1]!;
    const asciiRole = { ...tag.roles[0]!, id: "z-role", name: "ASCII role" };
    tag.roles = [tag.roles[0]!, asciiRole];
    tag.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstTag(song)?.holdingRole?.id).toBe("z-role");
  });

  it("keeps a band-wide last line when no active ranked role holds it", () => {
    const song = withTagSection({ isActive: false });
    const tag = resolveFirstTag(song);
    expect(tag?.section.id).toBe("tag-1");
    expect(tag?.holdingRole).toBeNull();
    expect(tag?.atSeconds).toBe(200);
  });

  it("skips a tag whose rehearsal window is unbounded", () => {
    const song = withTagSection({ start: Number.NaN, end: 208 });
    expect(resolveFirstTag(song)).toBeNull();
  });

  it("skips a tag whose end precedes its start", () => {
    const song = withTagSection({ start: 208, end: 200 });
    expect(resolveFirstTag(song)).toBeNull();
  });

  it("skips a zero-length tag window", () => {
    const song = withTagSection({ start: 200, end: 200 });
    expect(resolveFirstTag(song)).toBeNull();
  });

  it("skips a tag whose endpoint overflows the shared timing bound", () => {
    const song = withTagSection({
      start: MAX_SECTION_TIME_SECONDS,
      end: MAX_SECTION_TIME_SECONDS + 1
    });
    expect(resolveFirstTag(song)).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstTag(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withTagSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstTag(song)).toBeNull();
  });

  it("keeps the last line band-wide when role identities are duplicated", () => {
    const song = withTagSection();
    const role = song.sections[1]!.roles[0]!;
    song.sections[1]!.roles = [role, { ...role }];
    song.sections[1]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const tag = resolveFirstTag(song);
    expect(tag?.section.id).toBe("tag-1");
    expect(tag?.holdingRole).toBeNull();
  });
});
