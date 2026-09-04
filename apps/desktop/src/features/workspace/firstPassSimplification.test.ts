import { createDemoRehearsalSong, type RehearsalRole, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillFirstPassCopy, firstPassSimplification } from "./firstPassSimplification";

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

describe("firstPassSimplification", () => {
  it("names the selected bass part's first-pass take", () => {
    expect(firstPassSimplification(createDemoRehearsalSong(), "bass-guitar")).toEqual({
      status: "ready",
      value: "Stay on roots if the chorus entrance gets muddy.",
      sectionLabel: "verse",
      roleName: "Bass Guitar"
    });
  });

  it("names the selected keys part's first-pass take", () => {
    expect(firstPassSimplification(createDemoRehearsalSong(), "keys-right")).toEqual({
      status: "ready",
      value: "Drop the top extension if the chorus turnaround still feels busy.",
      sectionLabel: "verse",
      roleName: "Keyboard 1 Right Hand"
    });
  });

  it("names the selected vocal part's first-pass take", () => {
    expect(firstPassSimplification(createDemoRehearsalSong(), "lead-vocal")).toEqual({
      status: "ready",
      value: "Keep the sustained note centered; skip the ad-lib on the first pass.",
      sectionLabel: "verse",
      roleName: "Lead Vocal"
    });
  });

  it("fails closed without a selected named part", () => {
    expect(firstPassSimplification(createDemoRehearsalSong(), null)).toEqual({ status: "unavailable" });
    expect(firstPassSimplification(createDemoRehearsalSong(), "   ")).toEqual({ status: "unavailable" });
    expect(firstPassSimplification(createDemoRehearsalSong(), "none")).toEqual({ status: "unavailable" });
  });

  it("fails closed on blank, none, or missing simplification values", () => {
    const blank = withRolePatch(createDemoRehearsalSong(), "bass-guitar", (role) => ({
      ...role,
      simplification: "  "
    }));
    const none = withRolePatch(createDemoRehearsalSong(), "lead-vocal", (role) => ({
      ...role,
      simplification: "none"
    }));
    const missing = withRolePatch(createDemoRehearsalSong(), "keys-right", (role) => {
      const { simplification: _dropped, ...withoutSimplification } = role;
      void _dropped;
      return withoutSimplification as RehearsalRole;
    });

    expect(firstPassSimplification(blank, "bass-guitar")).toEqual({ status: "unavailable" });
    expect(firstPassSimplification(none, "lead-vocal")).toEqual({ status: "unavailable" });
    expect(firstPassSimplification(missing, "keys-right")).toEqual({ status: "unavailable" });
  });

  it("fails closed when simplification is inherited instead of owned", () => {
    const song = createDemoRehearsalSong();
    const role = { ...song.sections[0]!.roles[0]! };
    const { simplification: _dropped, ...withoutSimplification } = role;
    void _dropped;
    Object.setPrototypeOf(withoutSimplification, { simplification: "sneaky roots only" });
    song.sections[0] = {
      ...song.sections[0]!,
      roles: [withoutSimplification as RehearsalRole, ...song.sections[0]!.roles.slice(1)]
    };

    expect(firstPassSimplification(song, "bass-guitar")).toEqual({ status: "unavailable" });
  });

  it("fails closed on a malformed song root", () => {
    expect(firstPassSimplification(null, "bass-guitar")).toEqual({ status: "unavailable" });
    expect(firstPassSimplification({ title: "no sections" }, "bass-guitar")).toEqual({
      status: "unavailable"
    });
  });

  it("fails closed on a malformed section member", () => {
    const song = createDemoRehearsalSong();
    song.sections = [null as unknown as RehearsalSong["sections"][number], ...song.sections];

    expect(firstPassSimplification(song, "bass-guitar")).toEqual({ status: "unavailable" });
  });

  it("fails closed when a section omits roles or a role omits identity", () => {
    const missingRoles = createDemoRehearsalSong();
    const { roles: _droppedRoles, ...sectionWithoutRoles } = missingRoles.sections[0]!;
    void _droppedRoles;
    missingRoles.sections[0] = sectionWithoutRoles as RehearsalSong["sections"][number];

    const missingRoleIdentity = createDemoRehearsalSong();
    const { id: _droppedId, ...roleWithoutId } = missingRoleIdentity.sections[0]!.roles[0]!;
    void _droppedId;
    missingRoleIdentity.sections[0] = {
      ...missingRoleIdentity.sections[0]!,
      roles: [roleWithoutId as RehearsalRole, ...missingRoleIdentity.sections[0]!.roles.slice(1)]
    };

    expect(firstPassSimplification(missingRoles, "bass-guitar")).toEqual({ status: "unavailable" });
    expect(firstPassSimplification(missingRoleIdentity, "bass-guitar")).toEqual({
      status: "unavailable"
    });
  });

  it("fails closed on duplicate role ids in one section", () => {
    const song = createDemoRehearsalSong();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: [...song.sections[0]!.roles, { ...song.sections[0]!.roles[0]! }]
    };

    expect(firstPassSimplification(song, "bass-guitar")).toEqual({ status: "unavailable" });
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

    expect(firstPassSimplification(song, "bass-guitar")).toEqual({ status: "unavailable" });
  });

  it("skips a non-canonical section label instead of showing it as the first pass", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, label: "drop-D intro" as RehearsalSong["sections"][number]["label"] },
      { ...verse, id: "chorus-1", label: "chorus" }
    ];

    expect(firstPassSimplification(song, "bass-guitar")).toEqual({
      status: "ready",
      value: "Stay on roots if the chorus entrance gets muddy.",
      sectionLabel: "chorus",
      roleName: "Bass Guitar"
    });
  });

  it("does not skip an untrusted first canonical take to a later section", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      {
        ...verse,
        roles: verse.roles.map((role) =>
          role.id === "bass-guitar" ? { ...role, simplification: "none" } : role
        )
      },
      {
        ...verse,
        id: "chorus-1",
        label: "chorus",
        roles: verse.roles.map((role) =>
          role.id === "bass-guitar"
            ? { ...role, simplification: "Hold roots through the chorus lift." }
            : role
        )
      }
    ];

    expect(firstPassSimplification(song, "bass-guitar")).toEqual({ status: "unavailable" });
  });

  it("fails closed for an unknown selected role", () => {
    expect(firstPassSimplification(createDemoRehearsalSong(), "missing-role")).toEqual({
      status: "unavailable"
    });
  });
});

describe("fillFirstPassCopy", () => {
  it("fills owned tokens and leaves inherited members literal", () => {
    expect(
      fillFirstPassCopy("First pass for {roleName} in {sectionLabel}: {value} Play that simpler take before adding the rest.", {
        roleName: "Bass Guitar",
        sectionLabel: "verse",
        value: "Stay on roots if the chorus entrance gets muddy."
      })
    ).toBe(
      "First pass for Bass Guitar in verse: Stay on roots if the chorus entrance gets muddy. Play that simpler take before adding the rest."
    );

    expect(fillFirstPassCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
