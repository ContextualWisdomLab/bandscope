import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillConfirmedChordCopy,
  selectedPartConfirmedChord
} from "./selectedPartConfirmedChord";

function withSelectedOverride(
  song: RehearsalSong,
  roleId: string,
  chord: string | null,
  extras: Partial<RehearsalSong["sections"][number]["roles"][number]> = {}
): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) => {
        if (role.id !== roleId) {
          return role;
        }
        return {
          ...role,
          ...extras,
          manualOverrides:
            chord === null
              ? []
              : [
                  {
                    field: "harmony" as const,
                    value: {
                      chord,
                      functionLabel: "user confirmed",
                      source: "user" as const
                    },
                    source: "user" as const
                  }
                ]
        };
      })
    }))
  };
}

describe("selectedPartConfirmedChord", () => {
  it("names the selected part's first own user harmony override", () => {
    expect(selectedPartConfirmedChord(createDemoRehearsalSong(), "lead-vocal")).toEqual({
      sectionLabel: "verse",
      roleName: "Lead Vocal",
      chord: "C#m11"
    });
  });

  it("stays hidden until a named part is selected", () => {
    expect(selectedPartConfirmedChord(createDemoRehearsalSong(), null)).toBeNull();
    expect(selectedPartConfirmedChord(createDemoRehearsalSong(), "   ")).toBeNull();
  });

  it("stays hidden when the selected part has no trusted override", () => {
    expect(selectedPartConfirmedChord(createDemoRehearsalSong(), "bass-guitar")).toBeNull();
    expect(
      selectedPartConfirmedChord(withSelectedOverride(createDemoRehearsalSong(), "bass-guitar", "none"), "bass-guitar")
    ).toBeNull();
  });

  it("skips inherited, model, and non-harmony overrides", () => {
    const song = createDemoRehearsalSong();
    const bass = song.sections[0]!.roles[0]!;
    const inherited = Object.create({
      manualOverrides: [
        {
          field: "harmony",
          value: { chord: "G", functionLabel: "inherited", source: "user" },
          source: "user"
        }
      ]
    }) as typeof bass;
    Object.assign(inherited, { ...bass, manualOverrides: undefined });
    delete (inherited as { manualOverrides?: unknown }).manualOverrides;
    song.sections[0]!.roles[0] = inherited;

    expect(selectedPartConfirmedChord(song, "bass-guitar")).toBeNull();

    const modelOnly = withSelectedOverride(createDemoRehearsalSong(), "bass-guitar", "E3");
    modelOnly.sections[0]!.roles[0] = {
      ...modelOnly.sections[0]!.roles[0]!,
      manualOverrides: [
        {
          field: "harmony",
          value: {
            chord: "Gmaj7",
            functionLabel: "model leftover",
            source: "model"
          },
          source: "model"
        }
      ]
    };

    expect(selectedPartConfirmedChord(modelOnly, "bass-guitar")).toBeNull();
  });

  it("fails closed on conflicting role copies and sparse collections", () => {
    const conflict = createDemoRehearsalSong();
    conflict.sections.push({
      ...conflict.sections[0]!,
      id: "verse-2",
      roles: conflict.sections[0]!.roles.map((role) =>
        role.id === "lead-vocal" ? { ...role, name: "Lead Vox" } : role
      )
    });
    expect(selectedPartConfirmedChord(conflict, "lead-vocal")).toBeNull();

    const chordConflict = createDemoRehearsalSong();
    chordConflict.sections.push({
      ...chordConflict.sections[0]!,
      id: "chorus-1",
      label: "chorus",
      roles: chordConflict.sections[0]!.roles.map((role) =>
        role.id === "lead-vocal"
          ? {
              ...role,
              manualOverrides: [
                {
                  field: "harmony" as const,
                  value: {
                    chord: "Bmaj7",
                    functionLabel: "other copy",
                    source: "user" as const
                  },
                  source: "user" as const
                }
              ]
            }
          : role
      )
    });
    expect(selectedPartConfirmedChord(chordConflict, "lead-vocal")).toBeNull();

    const sparse = createDemoRehearsalSong() as unknown as { sections: unknown[] };
    sparse.sections = [];
    sparse.sections[1] = createDemoRehearsalSong().sections[0];
    expect(selectedPartConfirmedChord(sparse as unknown as RehearsalSong, "lead-vocal")).toBeNull();
  });

  it("fails closed on malformed roots, traps, and non-canonical labels", () => {
    expect(selectedPartConfirmedChord(null as unknown as RehearsalSong, "lead-vocal")).toBeNull();
    expect(selectedPartConfirmedChord({} as RehearsalSong, "lead-vocal")).toBeNull();

    const trap = new Proxy(createDemoRehearsalSong(), {
      has() {
        throw new Error("has trap");
      },
      get(target, property, receiver) {
        if (property === "sections") {
          throw new Error("get trap");
        }
        return Reflect.get(target, property, receiver);
      }
    });
    expect(selectedPartConfirmedChord(trap, "lead-vocal")).toBeNull();

    const unknownLabel = createDemoRehearsalSong();
    unknownLabel.sections[0] = { ...unknownLabel.sections[0]!, label: "vibe-check" as typeof unknownLabel.sections[0]["label"] };
    expect(selectedPartConfirmedChord(unknownLabel, "lead-vocal")).toBeNull();
  });
});

describe("fillConfirmedChordCopy", () => {
  it("keeps placeholder-shaped chords literal", () => {
    expect(
      fillConfirmedChordCopy("{roleName} locks {chord} before {sectionLabel}.", {
        roleName: "Lead Vocal",
        chord: "C#m11 {sectionLabel}",
        sectionLabel: "verse"
      })
    ).toBe("Lead Vocal locks C#m11 {sectionLabel} before verse.");
  });

  it("does not satisfy tokens with inherited object members", () => {
    expect(fillConfirmedChordCopy("Use {toString} in {missingToken}.", { chord: "C#m11" })).toBe(
      "Use {toString} in {missingToken}."
    );
  });
});
