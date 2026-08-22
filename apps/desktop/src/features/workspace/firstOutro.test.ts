import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatOutroTime, resolveFirstOutro } from "./firstOutro";

function withOutroSection(
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
  const outro = structuredClone(verse);
  outro.id = overrides.id ?? "outro-1";
  outro.label = "outro";
  outro.timeRange = { start: overrides.start ?? 180, end: overrides.end ?? 196 };
  const roleId = overrides.roleId ?? "drums";
  outro.roles = [
    {
      ...verse.roles[0]!,
      id: roleId,
      name: overrides.roleName ?? "Drums",
      rehearsalPriority: overrides.priority ?? "high"
    }
  ];
  outro.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, outro];
  return song;
}

describe("resolveFirstOutro", () => {
  it("returns null when the demo song has no labeled outro", () => {
    expect(resolveFirstOutro(createDemoRehearsalSong())).toBeNull();
    expect(formatOutroTime(Number.NaN)).toBe("0:00");
    expect(formatOutroTime(-4)).toBe("0:00");
  });

  it("does not invent an outro from a verse, chorus, intro, tag, pickup, stop, or handoff", () => {
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
    const tag = structuredClone(verse);
    tag.id = "tag-1";
    tag.label = "tag";
    tag.timeRange = { start: 200, end: 208 };
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
    song.sections = [intro, verse, pickup, stop, chorus, handoff, tag];

    expect(resolveFirstOutro(song)).toBeNull();
  });

  it("does not treat the last unlabeled section as an outro", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = { start: 180, end: 196 };
    expect(song.sections[0]!.label).toBe("verse");
    expect(resolveFirstOutro(song)).toBeNull();
  });

  it("picks the earliest labeled outro and the part that lands it", () => {
    const song = withOutroSection({ start: 180, end: 196 });
    const outro = resolveFirstOutro(song);

    expect(outro?.section.id).toBe("outro-1");
    expect(outro?.holdingRole?.id).toBe("drums");
    expect(outro?.atSeconds).toBe(180);
    expect(formatOutroTime(outro?.atSeconds ?? -1)).toBe("3:00");
  });

  it("prefers the earlier of two labeled outros", () => {
    const song = withOutroSection({ id: "outro-late", start: 220, end: 236 });
    const verse = song.sections[0]!;
    const earlier = structuredClone(song.sections[1]!);
    earlier.id = "outro-early";
    earlier.timeRange = { start: 180, end: 196 };
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

    const outro = resolveFirstOutro(song);
    expect(outro?.section.id).toBe("outro-early");
    expect(outro?.holdingRole?.id).toBe("bass-guitar");
    expect(outro?.atSeconds).toBe(180);
  });

  it("breaks same-time outro ties with locale-independent id ordering", () => {
    const song = withOutroSection({ id: "ä-outro", start: 180, end: 196 });
    const asciiOutro = structuredClone(song.sections[1]!);
    asciiOutro.id = "z-outro";
    song.sections = [song.sections[0]!, song.sections[1]!, asciiOutro];

    expect(resolveFirstOutro(song)?.section.id).toBe("z-outro");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withOutroSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const outro = song.sections[1]!;
    const asciiRole = { ...outro.roles[0]!, id: "z-role", name: "ASCII role" };
    outro.roles = [outro.roles[0]!, asciiRole];
    outro.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstOutro(song)?.holdingRole?.id).toBe("z-role");
  });

  it("keeps a band-wide landing when no active ranked role holds it", () => {
    const song = withOutroSection({ isActive: false });
    const outro = resolveFirstOutro(song);
    expect(outro?.section.id).toBe("outro-1");
    expect(outro?.holdingRole).toBeNull();
    expect(outro?.atSeconds).toBe(180);
  });

  it("skips an outro whose rehearsal window is unbounded", () => {
    const song = withOutroSection({ start: Number.NaN, end: 196 });
    expect(resolveFirstOutro(song)).toBeNull();
  });

  it("skips an outro whose end precedes its start", () => {
    const song = withOutroSection({ start: 196, end: 180 });
    expect(resolveFirstOutro(song)).toBeNull();
  });

  it("skips a zero-length outro window", () => {
    const song = withOutroSection({ start: 180, end: 180 });
    expect(resolveFirstOutro(song)).toBeNull();
  });

  it("skips an outro whose endpoint overflows the shared timing bound", () => {
    const song = withOutroSection({
      start: MAX_SECTION_TIME_SECONDS,
      end: MAX_SECTION_TIME_SECONDS + 1
    });
    expect(resolveFirstOutro(song)).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstOutro(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withOutroSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstOutro(song)).toBeNull();
  });

  it("keeps the landing band-wide when role identities are duplicated", () => {
    const song = withOutroSection();
    const role = song.sections[1]!.roles[0]!;
    song.sections[1]!.roles = [role, { ...role }];
    song.sections[1]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const outro = resolveFirstOutro(song);
    expect(outro?.section.id).toBe("outro-1");
    expect(outro?.holdingRole).toBeNull();
  });
});
