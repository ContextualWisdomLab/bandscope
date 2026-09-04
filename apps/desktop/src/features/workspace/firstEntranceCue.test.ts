import { createDemoRehearsalSong, type RehearsalRole, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillEntranceCueCopy, firstEntranceCue, isAdmittedCueKind } from "./firstEntranceCue";

/** Return the demo song with one role replaced in every section it appears. */
function withRolePatch(
  song: RehearsalSong,
  roleId: string,
  patch: (role: RehearsalRole) => RehearsalRole
): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) => (role.id === roleId ? patch(role) : role))
    }))
  };
}

describe("isAdmittedCueKind", () => {
  it("admits only lyric, count, and transition", () => {
    expect(isAdmittedCueKind("lyric")).toBe(true);
    expect(isAdmittedCueKind("count")).toBe(true);
    expect(isAdmittedCueKind("transition")).toBe(true);
    expect(isAdmittedCueKind("groove")).toBe(false);
    expect(isAdmittedCueKind("")).toBe(false);
    expect(isAdmittedCueKind(null)).toBe(false);
  });
});

describe("firstEntranceCue", () => {
  it("names the selected bass part's first transition cue", () => {
    expect(firstEntranceCue(createDemoRehearsalSong(), "bass-guitar")).toEqual({
      status: "ready",
      kind: "transition",
      value: "Hold through the pickup before the downbeat.",
      sectionLabel: "verse",
      roleName: "Bass Guitar"
    });
  });

  it("names the selected keys part's first count cue", () => {
    expect(firstEntranceCue(createDemoRehearsalSong(), "keys-right")).toEqual({
      status: "ready",
      kind: "count",
      value: "Enter on beat 2 after the pickup.",
      sectionLabel: "verse",
      roleName: "Keyboard 1 Right Hand"
    });
  });

  it("names the selected vocal part's first lyric cue", () => {
    expect(firstEntranceCue(createDemoRehearsalSong(), "lead-vocal")).toEqual({
      status: "ready",
      kind: "lyric",
      value: "city lights",
      sectionLabel: "verse",
      roleName: "Lead Vocal"
    });
  });

  it("fails closed without a selected named part", () => {
    expect(firstEntranceCue(createDemoRehearsalSong(), null)).toEqual({ status: "unavailable" });
    expect(firstEntranceCue(createDemoRehearsalSong(), "   ")).toEqual({ status: "unavailable" });
    expect(firstEntranceCue(createDemoRehearsalSong(), "none")).toEqual({ status: "unavailable" });
  });

  it("fails closed on blank, none, or unknown cue values and kinds", () => {
    const blank = withRolePatch(createDemoRehearsalSong(), "bass-guitar", (role) => ({
      ...role,
      cue: { kind: "transition", value: "  " }
    }));
    const none = withRolePatch(createDemoRehearsalSong(), "lead-vocal", (role) => ({
      ...role,
      cue: { kind: "lyric", value: "none" }
    }));
    const unknownKind = withRolePatch(createDemoRehearsalSong(), "keys-right", (role) => ({
      ...role,
      cue: { kind: "groove" as RehearsalRole["cue"]["kind"], value: "on the one" }
    }));

    expect(firstEntranceCue(blank, "bass-guitar")).toEqual({ status: "unavailable" });
    expect(firstEntranceCue(none, "lead-vocal")).toEqual({ status: "unavailable" });
    expect(firstEntranceCue(unknownKind, "keys-right")).toEqual({ status: "unavailable" });
  });

  it("fails closed when cue is inherited instead of owned", () => {
    const song = createDemoRehearsalSong();
    const role = { ...song.sections[0]!.roles[0]! };
    const { cue: _dropped, ...withoutCue } = role;
    void _dropped;
    Object.setPrototypeOf(withoutCue, { cue: { kind: "lyric", value: "sneaky lyric" } });
    song.sections[0] = {
      ...song.sections[0]!,
      roles: [withoutCue as RehearsalRole, ...song.sections[0]!.roles.slice(1)]
    };

    expect(firstEntranceCue(song, "bass-guitar")).toEqual({ status: "unavailable" });
  });

  it("fails closed when cue kind is inherited", () => {
    const song = createDemoRehearsalSong();
    const inheritedKind = Object.create({ kind: "lyric" }) as RehearsalRole["cue"];
    inheritedKind.value = "city lights";
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      cue: inheritedKind
    };

    expect(firstEntranceCue(song, "bass-guitar")).toEqual({ status: "unavailable" });
  });

  it("fails closed on a malformed song root", () => {
    expect(firstEntranceCue(null, "bass-guitar")).toEqual({ status: "unavailable" });
    expect(firstEntranceCue({ title: "no sections" }, "bass-guitar")).toEqual({
      status: "unavailable"
    });
  });

  it("fails closed on duplicate role ids in one section", () => {
    const song = createDemoRehearsalSong();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: [...song.sections[0]!.roles, { ...song.sections[0]!.roles[0]! }]
    };

    expect(firstEntranceCue(song, "bass-guitar")).toEqual({ status: "unavailable" });
  });

  it("fails closed when the same selected id uses two display names", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      verse,
      {
        ...verse,
        id: "chorus-1",
        label: "chorus",
        roles: verse.roles.map((role) =>
          role.id === "bass-guitar" ? { ...role, name: "Electric Bass" } : role
        )
      }
    ];

    expect(firstEntranceCue(song, "bass-guitar")).toEqual({ status: "unavailable" });
  });

  it("skips a non-canonical section label instead of showing it as the entrance", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, label: "drop-D intro" as RehearsalSong["sections"][number]["label"] },
      { ...verse, id: "chorus-1", label: "chorus" }
    ];

    expect(firstEntranceCue(song, "bass-guitar")).toEqual({
      status: "ready",
      kind: "transition",
      value: "Hold through the pickup before the downbeat.",
      sectionLabel: "chorus",
      roleName: "Bass Guitar"
    });
  });

  it("does not skip an untrusted first canonical cue to a later section", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      {
        ...verse,
        roles: verse.roles.map((role) =>
          role.id === "bass-guitar" ? { ...role, cue: { kind: "transition", value: "none" } } : role
        )
      },
      {
        ...verse,
        id: "chorus-1",
        label: "chorus",
        roles: verse.roles.map((role) =>
          role.id === "bass-guitar"
            ? { ...role, cue: { kind: "transition", value: "Catch the chorus lift." } }
            : role
        )
      }
    ];

    expect(firstEntranceCue(song, "bass-guitar")).toEqual({ status: "unavailable" });
  });

  it("fails closed for an unknown selected role", () => {
    expect(firstEntranceCue(createDemoRehearsalSong(), "missing-role")).toEqual({
      status: "unavailable"
    });
  });
});

describe("fillEntranceCueCopy", () => {
  it("fills owned tokens and leaves inherited members literal", () => {
    expect(
      fillEntranceCueCopy("Listen for \"{value}\" in {sectionLabel}, then {roleName} enters.", {
        value: "city lights",
        sectionLabel: "verse",
        roleName: "Lead Vocal"
      })
    ).toBe('Listen for "city lights" in verse, then Lead Vocal enters.');

    expect(fillEntranceCueCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
