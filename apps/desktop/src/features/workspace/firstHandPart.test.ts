import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstHandPart } from "./firstHandPart";

function withoutHandRoles(song: RehearsalSong): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) => ({
        ...role,
        roleType: role.roleType === "hand" ? "instrument" : role.roleType
      }))
    }))
  };
}

describe("firstHandPart", () => {
  it("prefers the first named hand part that also carries a clash warning", () => {
    const part = firstHandPart(createDemoRehearsalSong());

    expect(part).toEqual({
      sectionLabel: "verse",
      roleName: "Keyboard 1 Right Hand",
      overlapWarning: "Melodic overlap: top notes conflict with Lead Vocal range."
    });
  });

  it("falls back to the first named hand part when clashes are only none sentinels", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role) =>
      role.roleType === "hand"
        ? { ...role, overlapWarnings: [" none ", ""] }
        : role
    );

    expect(firstHandPart(song)).toEqual({
      sectionLabel: "verse",
      roleName: "Keyboard 1 Right Hand",
      overlapWarning: undefined
    });
  });

  it("skips instrument and vocal roles even when they carry clash warnings", () => {
    const song = withoutHandRoles(createDemoRehearsalSong());

    expect(firstHandPart(song)).toBeNull();
  });

  it("still names the song-level first hand when the selected role is an instrument", () => {
    const part = firstHandPart(createDemoRehearsalSong(), "bass-guitar");

    expect(part).toEqual({
      sectionLabel: "verse",
      roleName: "Keyboard 1 Right Hand",
      overlapWarning: "Melodic overlap: top notes conflict with Lead Vocal range."
    });
  });

  it("limits the hand part to the selected hand role", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles.push({
      ...song.sections[0]!.roles[1]!,
      id: "keys-left",
      name: "Keyboard 1 Left Hand",
      overlapWarnings: []
    });

    expect(firstHandPart(song, "keys-left")).toEqual({
      sectionLabel: "verse",
      roleName: "Keyboard 1 Left Hand",
      overlapWarning: undefined
    });
  });

  it("fails closed on malformed runtime roots and collections", () => {
    for (const malformed of [null, {}, { sections: null }, { sections: [null] }]) {
      expect(firstHandPart(malformed as unknown as RehearsalSong)).toBeNull();
    }

    const song = createDemoRehearsalSong();
    const validHand = song.sections[0]!.roles.find((role) => role.roleType === "hand")!;
    const malformedSection = {
      ...song.sections[0],
      roles: [null, { ...validHand, name: "   " }, validHand]
    };

    expect(
      firstHandPart({ ...song, sections: [malformedSection] } as unknown as RehearsalSong)
    ).toEqual({
      sectionLabel: "verse",
      roleName: "Keyboard 1 Right Hand",
      overlapWarning: "Melodic overlap: top notes conflict with Lead Vocal range."
    });
  });

  it("does not invoke accessors while resolving untrusted hand-part evidence", () => {
    const song = createDemoRehearsalSong();
    let getterCalls = 0;
    const runtimeSong = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(runtimeSong, "sections", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return song.sections;
      }
    });

    expect(firstHandPart(runtimeSong as unknown as RehearsalSong)).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it("returns null when the selected role is missing", () => {
    expect(firstHandPart(createDemoRehearsalSong(), "missing-role")).toBeNull();
  });

  it("returns null when no hand part has a named section and role", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role) =>
      role.roleType === "hand" ? { ...role, name: "  " } : role
    );

    expect(firstHandPart(song)).toBeNull();
  });
});
