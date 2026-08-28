import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatRitardandoPlanTime, resolveFirstRitardandoPlan } from "./firstRitardando";

const DEMO_RITARDANDO_PLAN =
  "Ease this part from 120 BPM into 80 BPM; let the next downbeat land later.";

function withRitardandoSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    ritardandoPlan?: string;
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
    ritardandoPlan: overrides.ritardandoPlan ?? DEMO_RITARDANDO_PLAN,
    ...(overrides.source ? { ritardandoPlanSource: overrides.source } : { ritardandoPlanSource: "model" as const })
  };
  const current = structuredClone(verse);
  current.id = overrides.id ?? "chorus-rit";
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

describe("resolveFirstRitardandoPlan", () => {
  it("picks the earliest ritardando plan and the named vocal that owns it", () => {
    const resolved = resolveFirstRitardandoPlan(withRitardandoSection());
    expect(resolved?.section.id).toBe("chorus-rit");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.ritardandoPlan).toBe(DEMO_RITARDANDO_PLAN);
    expect(resolved?.atSeconds).toBe(0);
    expect(formatRitardandoPlanTime(resolved?.atSeconds ?? -1)).toBe("0:00");
    expect(formatRitardandoPlanTime(Number.NaN)).toBe("0:00");
    expect(formatRitardandoPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a ritardando plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, or confidence notes", () => {
    const song = withRitardandoSection();
    delete song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!.ritardandoPlan;
    const landing = song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    landing.simplification = "Stay on roots if the chorus entrance gets muddy.";
    landing.setupNote = DEMO_RITARDANDO_PLAN;
    landing.transpositionPlan = "If the singer drops to B minor, keep the shape a whole step lower.";
    landing.cue = { kind: "transition", value: DEMO_RITARDANDO_PLAN };
    landing.confidence.notes = DEMO_RITARDANDO_PLAN;
    expect(resolveFirstRitardandoPlan(song)).toBeNull();
  });

  it("leaves the heuristic demo unnamed", () => {
    expect(resolveFirstRitardandoPlan(createDemoRehearsalSong())).toBeNull();
  });

  it("does not let accompaniment own the ritardando", () => {
    expect(
      resolveFirstRitardandoPlan(
        withRitardandoSection({ roleId: "keys-right", roleType: "hand" })
      )
    ).toBeNull();
  });

  it("ignores inactive named parts", () => {
    expect(resolveFirstRitardandoPlan(withRitardandoSection({ isActive: false }))).toBeNull();
  });

  it("prefers a named vocal over bass at the same priority", () => {
    const song = withRitardandoSection();
    const bass = song.sections[0]!.roles.find((role) => role.id === "bass-guitar")!;
    bass.ritardandoPlan = DEMO_RITARDANDO_PLAN;
    bass.ritardandoPlanSource = "model";
    bass.rehearsalPriority = "high";
    expect(resolveFirstRitardandoPlan(song)?.landingRoleId).toBe("lead-vocal");
  });

  it("prefers the higher-priority named part", () => {
    const song = withRitardandoSection({ priority: "low" });
    const bass = song.sections[0]!.roles.find((role) => role.id === "bass-guitar")!;
    bass.ritardandoPlan = DEMO_RITARDANDO_PLAN;
    bass.ritardandoPlanSource = "model";
    bass.rehearsalPriority = "high";
    expect(resolveFirstRitardandoPlan(song)?.landingRoleId).toBe("bass-guitar");
  });

  it("picks the earlier section when two rits are named", () => {
    const earlier = withRitardandoSection({ id: "earlier-rit", start: 0 });
    const later = withRitardandoSection({ id: "later-rit", start: 16 });
    const song = earlier;
    song.sections = [...earlier.sections, ...later.sections];
    expect(resolveFirstRitardandoPlan(song)?.sectionId).toBe("earlier-rit");
  });

  it("rejects blank, multiline, or non-template model copy", () => {
    expect(resolveFirstRitardandoPlan(withRitardandoSection({ ritardandoPlan: "   " }))).toBeNull();
    expect(
      resolveFirstRitardandoPlan(
        withRitardandoSection({ ritardandoPlan: "Ease together.\nHold the count." })
      )
    ).toBeNull();
    expect(
      resolveFirstRitardandoPlan(withRitardandoSection({ ritardandoPlan: "slow down here" }))
    ).toBeNull();
  });

  it("rejects model copy that is not a genuine non-half-time slowing", () => {
    expect(
      resolveFirstRitardandoPlan(
        withRitardandoSection({
          ritardandoPlan:
            "Ease this part from 80 BPM into 120 BPM; let the next downbeat land later."
        })
      )
    ).toBeNull();
    expect(
      resolveFirstRitardandoPlan(
        withRitardandoSection({
          ritardandoPlan:
            "Ease this part from 120 BPM into 60 BPM; let the next downbeat land later."
        })
      )
    ).toBeNull();
    expect(resolveFirstRitardandoPlan(withRitardandoSection())?.ritardandoPlan).toBe(
      DEMO_RITARDANDO_PLAN
    );
  });

  it("admits bounded user copy without requiring the engine template", () => {
    const resolved = resolveFirstRitardandoPlan(
      withRitardandoSection({
        ritardandoPlan: "Pull the phrase late into the downbeat.",
        source: "user"
      })
    );
    expect(resolved?.ritardandoPlan).toBe("Pull the phrase late into the downbeat.");
    expect(resolved?.ritardandoPlanSource).toBe("user");
  });

  it("fails closed on a malformed runtime song root", () => {
    expect(resolveFirstRitardandoPlan(null as never)).toBeNull();
  });

  it("fails closed on inherited or accessor-backed plan copy", () => {
    const song = withRitardandoSection();
    const vocal = song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!;
    delete vocal.ritardandoPlan;
    Object.defineProperty(vocal, "ritardandoPlan", {
      configurable: true,
      enumerable: true,
      get() {
        return DEMO_RITARDANDO_PLAN;
      }
    });
    expect(resolveFirstRitardandoPlan(song)).toBeNull();
  });
});
