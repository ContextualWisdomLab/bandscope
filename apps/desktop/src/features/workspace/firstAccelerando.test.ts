import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatAccelerandoPlanTime, resolveFirstAccelerandoPlan } from "./firstAccelerando";

const DEMO_ACCELERANDO_PLAN =
  "Push this part from 80 BPM into 120 BPM; let the next downbeat arrive sooner.";

function withAccelerandoSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    accelerandoPlan?: string;
    source?: "model" | "user";
    label?: "intro" | "verse" | "chorus" | "bridge" | "outro";
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
    roleType?: "instrument" | "vocal" | "hand";
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const landingStart = overrides.start ?? 0;
  const roleId = overrides.roleId ?? "lead-vocal";
  const vocal = structuredClone(verse.roles.find((role) => role.id === "lead-vocal")!);
  const bass = structuredClone(verse.roles.find((role) => role.id === "bass-guitar")!);
  const keys = structuredClone(verse.roles.find((role) => role.id === "keys-right")!);
  const landing = {
    ...(roleId === "bass-guitar" ? bass : roleId === "keys-right" ? keys : vocal),
    id: roleId,
    name:
      overrides.roleName ??
      (roleId === "bass-guitar"
        ? "Bass Guitar"
        : roleId === "keys-right"
          ? "Keyboard 1 Right Hand"
          : "Lead Vocal"),
    roleType: overrides.roleType ?? (roleId === "lead-vocal" ? "vocal" : "instrument"),
    rehearsalPriority: overrides.priority ?? "high",
    accelerandoPlan: overrides.accelerandoPlan ?? DEMO_ACCELERANDO_PLAN,
    ...(overrides.source ? { accelerandoPlanSource: overrides.source } : { accelerandoPlanSource: "model" as const })
  };
  const current = structuredClone(verse);
  current.id = overrides.id ?? "chorus-accel";
  current.label = overrides.label ?? "chorus";
  current.timeRange = { start: landingStart, end: overrides.end ?? landingStart + 16 };
  current.roles = [landing, bass, keys];
  current.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    {
      role_id: "lead-vocal",
      is_active: roleId === "lead-vocal" ? (overrides.isActive ?? true) : true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  if (roleId === "bass-guitar") {
    current.partGraph[0]!.is_active = overrides.isActive ?? true;
    current.roles = [landing, vocal, keys];
  }
  if (roleId === "keys-right") {
    current.partGraph[1]!.is_active = overrides.isActive ?? true;
    current.roles = [landing, vocal, bass];
  }
  song.sections = [current];
  return song;
}

describe("resolveFirstAccelerandoPlan", () => {
  it("picks the earliest accelerando plan and the named vocal that owns it", () => {
    const resolved = resolveFirstAccelerandoPlan(withAccelerandoSection());
    expect(resolved?.section.id).toBe("chorus-accel");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.accelerandoPlan).toBe(DEMO_ACCELERANDO_PLAN);
    expect(resolved?.atSeconds).toBe(0);
    expect(formatAccelerandoPlanTime(resolved?.atSeconds ?? -1)).toBe("0:00");
    expect(formatAccelerandoPlanTime(Number.NaN)).toBe("0:00");
    expect(formatAccelerandoPlanTime(-4)).toBe("0:00");
  });

  it("does not invent an accelardando plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, or confidence notes", () => {
    const song = withAccelerandoSection();
    delete song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!.accelerandoPlan;
    const landing = song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    landing.simplification = "Stay on roots if the chorus entrance gets muddy.";
    landing.setupNote = DEMO_ACCELERANDO_PLAN;
    landing.transpositionPlan = "If the singer drops to B minor, keep the shape a whole step lower.";
    landing.cue = { kind: "transition", value: DEMO_ACCELERANDO_PLAN };
    landing.confidence.notes = DEMO_ACCELERANDO_PLAN;
    expect(resolveFirstAccelerandoPlan(song)).toBeNull();
  });

  it("leaves the heuristic demo unnamed", () => {
    expect(resolveFirstAccelerandoPlan(createDemoRehearsalSong())).toBeNull();
  });

  it("does not let accompaniment own the accelerando", () => {
    expect(
      resolveFirstAccelerandoPlan(
        withAccelerandoSection({ roleId: "keys-right", roleType: "hand" })
      )
    ).toBeNull();
  });

  it("ignores inactive named parts", () => {
    expect(resolveFirstAccelerandoPlan(withAccelerandoSection({ isActive: false }))).toBeNull();
  });

  it("prefers a named vocal over bass at the same priority", () => {
    const song = withAccelerandoSection();
    const bass = song.sections[0]!.roles.find((role) => role.id === "bass-guitar")!;
    bass.accelerandoPlan = DEMO_ACCELERANDO_PLAN;
    bass.accelerandoPlanSource = "model";
    bass.rehearsalPriority = "high";
    expect(resolveFirstAccelerandoPlan(song)?.landingRoleId).toBe("lead-vocal");
  });

  it("prefers the higher-priority named part", () => {
    const song = withAccelerandoSection({ priority: "low" });
    const bass = song.sections[0]!.roles.find((role) => role.id === "bass-guitar")!;
    bass.accelerandoPlan = DEMO_ACCELERANDO_PLAN;
    bass.accelerandoPlanSource = "model";
    bass.rehearsalPriority = "high";
    expect(resolveFirstAccelerandoPlan(song)?.landingRoleId).toBe("bass-guitar");
  });

  it("picks the earlier section when two accels are named", () => {
    const earlier = withAccelerandoSection({ id: "earlier-accel", start: 0 });
    const later = withAccelerandoSection({ id: "later-accel", start: 16 });
    const song = earlier;
    song.sections = [...earlier.sections, ...later.sections];
    expect(resolveFirstAccelerandoPlan(song)?.sectionId).toBe("earlier-accel");
  });

  it("rejects blank, multiline, or non-template model copy", () => {
    expect(resolveFirstAccelerandoPlan(withAccelerandoSection({ accelerandoPlan: "   " }))).toBeNull();
    expect(
      resolveFirstAccelerandoPlan(
        withAccelerandoSection({ accelerandoPlan: "Ease together.\nHold the count." })
      )
    ).toBeNull();
    expect(
      resolveFirstAccelerandoPlan(
        withAccelerandoSection({ accelerandoPlan: `${DEMO_ACCELERANDO_PLAN}\n` })
      )
    ).toBeNull();
    expect(
      resolveFirstAccelerandoPlan(withAccelerandoSection({ accelerandoPlan: "slow down here" }))
    ).toBeNull();
  });

  it("rejects model copy that is not a genuine non-double-time speeding", () => {
    expect(
      resolveFirstAccelerandoPlan(
        withAccelerandoSection({
          accelerandoPlan:
            "Push this part from 120 BPM into 80 BPM; let the next downbeat arrive sooner."
        })
      )
    ).toBeNull();
    expect(
      resolveFirstAccelerandoPlan(
        withAccelerandoSection({
          accelerandoPlan:
            "Push this part from 60 BPM into 120 BPM; let the next downbeat arrive sooner."
        })
      )
    ).toBeNull();
    expect(resolveFirstAccelerandoPlan(withAccelerandoSection())?.accelerandoPlan).toBe(
      DEMO_ACCELERANDO_PLAN
    );
  });

  it("preserves long user-authored copy without requiring the engine template", () => {
    const accelerandoPlan = `Push the phrase early ${"A".repeat(170)} into the downbeat.`;
    const resolved = resolveFirstAccelerandoPlan(
      withAccelerandoSection({
        accelerandoPlan,
        source: "user"
      })
    );
    expect(resolved?.accelerandoPlan).toBe(accelerandoPlan);
    expect(resolved?.accelerandoPlanSource).toBe("user");
  });

  it("fails closed when persisted accelerando copy has no provenance", () => {
    const song = withAccelerandoSection();
    delete song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!
      .accelerandoPlanSource;

    expect(resolveFirstAccelerandoPlan(song)).toBeNull();
  });

  it("fails closed on a malformed runtime song root", () => {
    expect(resolveFirstAccelerandoPlan(null as never)).toBeNull();
  });

  it("rejects a sparse hostile section array without scanning its declared length", () => {
    const song = createDemoRehearsalSong();
    song.sections = new Array(0xffffffff) as typeof song.sections;

    expect(resolveFirstAccelerandoPlan(song)).toBeNull();
  });

  it("fails closed on inherited or accessor-backed plan copy", () => {
    const song = withAccelerandoSection();
    const vocal = song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!;
    delete vocal.accelerandoPlan;
    Object.defineProperty(vocal, "accelerandoPlan", {
      configurable: true,
      enumerable: true,
      get() {
        return DEMO_ACCELERANDO_PLAN;
      }
    });
    expect(resolveFirstAccelerandoPlan(song)).toBeNull();
  });
});
