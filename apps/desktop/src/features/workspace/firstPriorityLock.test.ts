import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstPriorityLock } from "./firstPriorityLock";

function withRolePriorities(
  song: RehearsalSong,
  priorities: Record<string, RehearsalSong["sections"][number]["roles"][number]["rehearsalPriority"] | unknown>
): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) =>
        Object.prototype.hasOwnProperty.call(priorities, role.id)
          ? { ...role, rehearsalPriority: priorities[role.id] as RehearsalSong["sections"][number]["roles"][number]["rehearsalPriority"] }
          : role
      )
    }))
  };
}

describe("firstPriorityLock", () => {
  it("prefers the first named high-priority part", () => {
    expect(firstPriorityLock(createDemoRehearsalSong())).toEqual({
      sectionLabel: "verse",
      roleName: "Bass Guitar",
      priority: "high"
    });
  });

  it("falls back to the first named medium-priority part when no high-priority lock-in exists", () => {
    const song = withRolePriorities(createDemoRehearsalSong(), {
      "bass-guitar": "medium",
      "keys-right": "low",
      "lead-vocal": "medium"
    });

    expect(firstPriorityLock(song)).toEqual({
      sectionLabel: "verse",
      roleName: "Bass Guitar",
      priority: "medium"
    });
  });

  it("skips low-priority parts instead of naming them as tonight's first lock-in", () => {
    const song = withRolePriorities(createDemoRehearsalSong(), {
      "bass-guitar": "low",
      "keys-right": "low",
      "lead-vocal": "low"
    });

    expect(firstPriorityLock(song)).toBeNull();
  });

  it("limits the lock-in to the selected role", () => {
    expect(firstPriorityLock(createDemoRehearsalSong(), "lead-vocal")).toEqual({
      sectionLabel: "verse",
      roleName: "Lead Vocal",
      priority: "medium"
    });
  });

  it("returns null when the selected role is only low-priority", () => {
    const song = withRolePriorities(createDemoRehearsalSong(), {
      "lead-vocal": "low"
    });

    expect(firstPriorityLock(song, "lead-vocal")).toBeNull();
  });

  it("skips blank names and inherited or malformed priority evidence", () => {
    const song = createDemoRehearsalSong();
    const inherited = Object.create({
      id: "ghost-high",
      name: "Ghost High",
      rehearsalPriority: "high"
    }) as RehearsalSong["sections"][number]["roles"][number];
    song.sections[0]!.roles = [
      { ...song.sections[0]!.roles[0]!, name: "   " },
      inherited,
      { ...song.sections[0]!.roles[1]!, rehearsalPriority: "urgent" as RehearsalSong["sections"][number]["roles"][number]["rehearsalPriority"] },
      song.sections[0]!.roles[2]!
    ];

    expect(firstPriorityLock(song)).toEqual({
      sectionLabel: "verse",
      roleName: "Lead Vocal",
      priority: "medium"
    });
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstPriorityLock(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });
});

describe("priority lock copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy("{roleName} is a high-priority {sectionLabel} part.", {
        roleName: "Bass {sectionLabel}",
        sectionLabel: "verse"
      })
    ).toBe("Bass {sectionLabel} is a high-priority verse part.");
  });
});
