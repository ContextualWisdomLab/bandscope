import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstHandoffAction } from "./firstHandoffAction";

describe("firstHandoffAction", () => {
  it("leads with the first clashing span and keeps role identity structured", () => {
    expect(firstHandoffAction(createDemoRehearsalSong())).toEqual({
      sectionId: "verse-1",
      sectionLabel: "verse",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3",
      clash: true
    });
  });

  it("uses the check lead when the first span has no clash", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role) => ({
      ...role,
      overlapWarnings: []
    }));

    expect(firstHandoffAction(song)).toEqual({
      sectionId: "verse-1",
      sectionLabel: "verse",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3",
      clash: false
    });
  });

  it("returns null when no named span exists", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role) => ({
      ...role,
      range: { lowestNote: "", highestNote: "none" },
      overlapWarnings: []
    }));

    expect(firstHandoffAction(song)).toBeNull();
  });

  it("fails closed on malformed runtime collections", () => {
    expect(firstHandoffAction(null as unknown as RehearsalSong)).toBeNull();
    expect(firstHandoffAction({ sections: null } as unknown as RehearsalSong)).toBeNull();
  });

  it("skips malformed roles, blank ids, and non-form sections until a named span exists", () => {
    const song = createDemoRehearsalSong();
    const validRole = song.sections[0]!.roles[0]!;
    const malformedSection = {
      ...song.sections[0],
      roles: [
        null,
        { ...validRole, id: "  ", overlapWarnings: [" none "] },
        { ...validRole, range: null, overlapWarnings: ["Density"] },
        validRole
      ]
    };

    expect(
      firstHandoffAction({ ...song, sections: [malformedSection] } as unknown as RehearsalSong)
    ).toEqual({
      sectionId: "verse-1",
      sectionLabel: "verse",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3",
      clash: true
    });
  });

  it("skips sections whose form label is not a contracted rehearsal form", () => {
    const song = createDemoRehearsalSong();
    song.sections[0] = {
      ...song.sections[0]!,
      label: "solo" as RehearsalSong["sections"][number]["label"]
    };

    expect(firstHandoffAction(song)).toBeNull();
  });

  it("keeps formula-shaped role names literal so JSON encoding can neutralize them later", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      name: '=HYPERLINK("http://evil")'
    };

    expect(firstHandoffAction(song)).toMatchObject({
      roleName: '=HYPERLINK("http://evil")',
      clash: true
    });
  });
});
