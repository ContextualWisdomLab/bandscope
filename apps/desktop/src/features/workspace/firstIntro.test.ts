import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatIntroTime, resolveFirstIntro } from "./firstIntro";

function withIntroSection(
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
  const intro = structuredClone(verse);
  intro.id = overrides.id ?? "intro-1";
  intro.label = "intro";
  intro.timeRange = { start: overrides.start ?? 0, end: overrides.end ?? 8 };
  const roleId = overrides.roleId ?? "drums";
  intro.roles = [
    {
      ...verse.roles[0]!,
      id: roleId,
      name: overrides.roleName ?? "Drums",
      rehearsalPriority: overrides.priority ?? "high"
    }
  ];
  intro.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [intro, verse];
  return song;
}

describe("resolveFirstIntro", () => {
  it("returns null when the demo song has no labeled intro", () => {
    expect(resolveFirstIntro(createDemoRehearsalSong())).toBeNull();
    expect(formatIntroTime(Number.NaN)).toBe("0:00");
    expect(formatIntroTime(-4)).toBe("0:00");
  });

  it("does not invent an intro from a verse, chorus, pickup, stop, or handoff", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const chorus = structuredClone(verse);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 30, end: 46 };
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
    song.sections = [verse, pickup, stop, chorus, handoff];

    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("does not treat the first unlabeled section as an intro", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = { start: 0, end: 16 };
    expect(song.sections[0]!.label).toBe("verse");
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("picks the earliest labeled intro and the part that counts it in", () => {
    const song = withIntroSection({ start: 0, end: 8 });
    const intro = resolveFirstIntro(song);

    expect(intro?.section.id).toBe("intro-1");
    expect(intro?.holdingRole?.id).toBe("drums");
    expect(intro?.atSeconds).toBe(0);
    expect(formatIntroTime(intro?.atSeconds ?? -1)).toBe("0:00");
  });

  it("prefers the earlier of two labeled intros", () => {
    const song = withIntroSection({ id: "intro-late", start: 64, end: 72 });
    const verse = song.sections[1]!;
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "intro-early";
    earlier.timeRange = { start: 0, end: 8 };
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
    song.sections = [song.sections[1]!, song.sections[0]!, earlier];

    const intro = resolveFirstIntro(song);
    expect(intro?.section.id).toBe("intro-early");
    expect(intro?.holdingRole?.id).toBe("bass-guitar");
    expect(intro?.atSeconds).toBe(0);
  });

  it("keeps a band-wide start when no active ranked role holds it", () => {
    const song = withIntroSection({ isActive: false });
    const intro = resolveFirstIntro(song);
    expect(intro?.section.id).toBe("intro-1");
    expect(intro?.holdingRole).toBeNull();
    expect(intro?.atSeconds).toBe(0);
  });

  it("skips an intro whose rehearsal window is unbounded", () => {
    const song = withIntroSection({ start: Number.NaN, end: 8 });
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("skips an intro whose end precedes its start", () => {
    const song = withIntroSection({ start: 8, end: 0 });
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("skips a zero-length intro window", () => {
    const song = withIntroSection({ start: 0, end: 0 });
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("skips an intro whose endpoint overflows the shared timing bound", () => {
    const song = withIntroSection({
      start: MAX_SECTION_TIME_SECONDS,
      end: MAX_SECTION_TIME_SECONDS + 1
    });
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstIntro(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withIntroSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstIntro(song)).toBeNull();
  });

  it("keeps the start band-wide when role identities are duplicated", () => {
    const song = withIntroSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const intro = resolveFirstIntro(song);
    expect(intro?.section.id).toBe("intro-1");
    expect(intro?.holdingRole).toBeNull();
  });
});
