import { createDemoRehearsalSong, type RehearsalRole } from "@bandscope/shared-types";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatEntranceTime, resolveFirstEntrance } from "./firstEntrance";

describe("resolveFirstEntrance", () => {
  it("picks the earliest section and its highest-priority role", () => {
    const song = createDemoRehearsalSong();
    const entrance = resolveFirstEntrance(song);

    expect(entrance?.section.id).toBe("verse-1");
    expect(entrance?.role.id).toBe("bass-guitar");
    expect(entrance?.startSeconds).toBe(10);
    expect(formatEntranceTime(entrance?.startSeconds ?? -1)).toBe("0:10");
    expect(formatEntranceTime(Number.NaN)).toBe("0:00");
  });

  it("returns null when no section has a part to hear", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];
    expect(resolveFirstEntrance(song)).toBeNull();
  });

  it("skips an earlier section that has no part to hear", () => {
    const song = createDemoRehearsalSong();
    const originalSection = song.sections[0]!;
    const laterSection = {
      ...originalSection,
      id: "later-section",
      timeRange: { start: 42, end: 60 },
      roles: [...originalSection.roles]
    };
    song.sections = [{ ...originalSection, roles: [] }, laterSection];

    const entrance = resolveFirstEntrance(song);
    expect(entrance?.section.id).toBe("later-section");
    expect(entrance?.role.id).toBe("bass-guitar");
    expect(entrance?.startSeconds).toBe(42);
  });

  it("ignores sections with non-finite or negative start times", () => {
    const song = createDemoRehearsalSong();
    const originalSection = song.sections[0]!;
    const laterSection = {
      ...originalSection,
      id: "valid-section",
      timeRange: { start: 30, end: 50 },
      roles: [...originalSection.roles]
    };
    song.sections = [
      { ...originalSection, id: "nan-section", timeRange: { start: Number.NaN, end: 20 } },
      { ...originalSection, id: "negative-section", timeRange: { start: -1, end: 20 } },
      laterSection
    ];

    expect(resolveFirstEntrance(song)?.section.id).toBe("valid-section");
  });

  it("ignores roles with unknown rehearsal priorities", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const validRole = section.roles[1];
    if (!validRole) {
      throw new Error("Demo rehearsal song must include at least two roles.");
    }
    const invalidRole = {
      ...section.roles[0]!,
      rehearsalPriority: "urgent"
    } as unknown as RehearsalRole;
    section.roles = [invalidRole, validRole];

    expect(resolveFirstEntrance(song)?.role.id).toBe(validRole.id);

    section.roles = [invalidRole];
    expect(resolveFirstEntrance(song)).toBeNull();
  });

  it("keeps earliest-section and priority ordering stable across valid metadata", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 600 }),
        fc.integer({ min: 0, max: 600 }),
        fc.array(fc.constantFrom("high", "medium", "low"), { minLength: 1, maxLength: 12 }),
        (firstStart, secondStart, priorities) => {
          const song = createDemoRehearsalSong();
          const originalSection = song.sections[0]!;
          const baseRole = originalSection.roles[0]!;
          const roles = priorities.map((priority, index) => ({
            ...baseRole,
            id: `role-${index}`,
            rehearsalPriority: priority
          }));
          const partGraph = roles.map((role) => ({
            role_id: role.id,
            is_active: true,
            handoff_to: [],
            handoff_from: []
          }));
          const firstSection = {
            ...originalSection,
            id: "first-generated-section",
            timeRange: { start: firstStart, end: firstStart + 1 },
            roles,
            partGraph
          };
          const secondSection = {
            ...originalSection,
            id: "second-generated-section",
            timeRange: { start: secondStart, end: secondStart + 1 },
            roles,
            partGraph
          };
          song.sections = [firstSection, secondSection];

          const entrance = resolveFirstEntrance(song);
          expect(entrance?.startSeconds).toBe(Math.min(firstStart, secondStart));
          const expectedPriority = priorities.includes("high")
            ? "high"
            : priorities.includes("medium")
              ? "medium"
              : "low";
          expect(entrance?.role.rehearsalPriority).toBe(expectedPriority);
        }
      )
    );
  });
});