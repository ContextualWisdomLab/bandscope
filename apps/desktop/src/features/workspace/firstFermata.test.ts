import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatFermataPlanTime, resolveFirstFermataPlan } from "./firstFermata";

const DEMO_FERMATA_PLAN =
  "Hold this part through the extra 1 s; wait for the cutoff before the next entrance.";

function withFermataSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    fermataPlan?: string;
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
    fermataPlan: overrides.fermataPlan ?? DEMO_FERMATA_PLAN,
    ...(overrides.source ? { fermataPlanSource: overrides.source } : { fermataPlanSource: "model" as const })
  };
  const current = structuredClone(verse);
  current.id = overrides.id ?? "chorus-fermata";
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

describe("resolveFirstFermataPlan", () => {
  it("picks the earliest fermata plan and the named vocal that owns it", () => {
    const resolved = resolveFirstFermataPlan(withFermataSection());
    expect(resolved?.section.id).toBe("chorus-fermata");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.fermataPlan).toBe(DEMO_FERMATA_PLAN);
    expect(resolved?.atSeconds).toBe(0);
    expect(formatFermataPlanTime(resolved?.atSeconds ?? -1)).toBe("0:00");
    expect(formatFermataPlanTime(Number.NaN)).toBe("0:00");
    expect(formatFermataPlanTime(-4)).toBe("0:00");
  });

  it("does not invent an fermata plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, or confidence notes", () => {
    const song = withFermataSection();
    delete song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!.fermataPlan;
    const landing = song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    landing.simplification = "Stay on roots if the chorus entrance gets muddy.";
    landing.setupNote = DEMO_FERMATA_PLAN;
    landing.transpositionPlan = "If the singer drops to B minor, keep the shape a whole step lower.";
    landing.cue = { kind: "transition", value: DEMO_FERMATA_PLAN };
    landing.confidence.notes = DEMO_FERMATA_PLAN;
    expect(resolveFirstFermataPlan(song)).toBeNull();
  });

  it("leaves the heuristic demo unnamed", () => {
    expect(resolveFirstFermataPlan(createDemoRehearsalSong())).toBeNull();
  });

  it("does not let accompaniment own the fermata", () => {
    expect(
      resolveFirstFermataPlan(
        withFermataSection({ roleId: "keys-right", roleType: "hand" })
      )
    ).toBeNull();
  });

  it("ignores inactive named parts", () => {
    expect(resolveFirstFermataPlan(withFermataSection({ isActive: false }))).toBeNull();
  });

  it("prefers a named vocal over bass at the same priority", () => {
    const song = withFermataSection();
    const bass = song.sections[0]!.roles.find((role) => role.id === "bass-guitar")!;
    bass.fermataPlan = DEMO_FERMATA_PLAN;
    bass.fermataPlanSource = "model";
    bass.rehearsalPriority = "high";
    expect(resolveFirstFermataPlan(song)?.landingRoleId).toBe("lead-vocal");
  });

  it("prefers the higher-priority named part", () => {
    const song = withFermataSection({ priority: "low" });
    const bass = song.sections[0]!.roles.find((role) => role.id === "bass-guitar")!;
    bass.fermataPlan = DEMO_FERMATA_PLAN;
    bass.fermataPlanSource = "model";
    bass.rehearsalPriority = "high";
    expect(resolveFirstFermataPlan(song)?.landingRoleId).toBe("bass-guitar");
  });

  it("picks the earlier section when two fermatas are named", () => {
    const earlier = withFermataSection({ id: "earlier-fermata", start: 0 });
    const later = withFermataSection({ id: "later-fermata", start: 16 });
    const song = earlier;
    song.sections = [...earlier.sections, ...later.sections];
    expect(resolveFirstFermataPlan(song)?.sectionId).toBe("earlier-fermata");
  });

  it("rejects blank, multiline, or non-template model copy", () => {
    expect(resolveFirstFermataPlan(withFermataSection({ fermataPlan: "   " }))).toBeNull();
    expect(
      resolveFirstFermataPlan(
        withFermataSection({ fermataPlan: "Ease together.\nHold the count." })
      )
    ).toBeNull();
    expect(
      resolveFirstFermataPlan(withFermataSection({ fermataPlan: "hold forever" }))
    ).toBeNull();
  });

  it("rejects model copy that is not a genuine isolated extra-hold", () => {
    expect(
      resolveFirstFermataPlan(
        withFermataSection({
          fermataPlan:
            "Hold this part through the extra 0 s; wait for the cutoff before the next entrance."
        })
      )
    ).toBeNull();
    expect(
      resolveFirstFermataPlan(
        withFermataSection({
          fermataPlan:
            "Hold this part through the extra 12 s; wait for the cutoff before the next entrance."
        })
      )
    ).toBeNull();
    expect(
      resolveFirstFermataPlan(
        withFermataSection({
          fermataPlan:
            "Push this part from 80 BPM into 120 BPM; let the next downbeat arrive sooner."
        })
      )
    ).toBeNull();
    expect(resolveFirstFermataPlan(withFermataSection())?.fermataPlan).toBe(
      DEMO_FERMATA_PLAN
    );
  });

  it("admits bounded user copy without requiring the engine template", () => {
    const resolved = resolveFirstFermataPlan(
      withFermataSection({
        fermataPlan: "Hold the last chord until the cut.",
        source: "user"
      })
    );
    expect(resolved?.fermataPlan).toBe("Hold the last chord until the cut.");
    expect(resolved?.fermataPlanSource).toBe("user");
  });

  it("fails closed on a malformed runtime song root", () => {
    expect(resolveFirstFermataPlan(null as never)).toBeNull();
  });

  it("fails closed on inherited or accessor-backed plan copy", () => {
    const song = withFermataSection();
    const vocal = song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!;
    delete vocal.fermataPlan;
    Object.defineProperty(vocal, "fermataPlan", {
      configurable: true,
      enumerable: true,
      get() {
        return DEMO_FERMATA_PLAN;
      }
    });
    expect(resolveFirstFermataPlan(song)).toBeNull();
  });
});
