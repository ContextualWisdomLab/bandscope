import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatLyricCueTime, resolveFirstLyricCue } from "./firstLyricCue";

describe("resolveFirstLyricCue", () => {
  it("picks the earliest lyric cue, not the first instrumental entrance", () => {
    const song = createDemoRehearsalSong();
    const cue = resolveFirstLyricCue(song);

    expect(cue?.section.id).toBe("verse-1");
    expect(cue?.role.id).toBe("lead-vocal");
    expect(cue?.lyric).toBe("city lights");
    expect(cue?.startSeconds).toBe(10);
    expect(formatLyricCueTime(cue?.startSeconds ?? -1)).toBe("0:10");
    expect(formatLyricCueTime(Number.NaN)).toBe("0:00");
  });

  it("returns null when no part has a lyric to hear", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];
    expect(resolveFirstLyricCue(song)).toBeNull();
  });

  it("skips an earlier section that only has count or transition cues", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const later = structuredClone(verse);
    later.id = "chorus-1";
    later.label = "chorus";
    later.timeRange = { start: 40, end: 70 };
    later.roles = [
      {
        ...verse.roles[2]!,
        id: "lead-vocal-chorus",
        cue: { kind: "lyric", value: "  stay up  " }
      }
    ];
    song.sections = [
      {
        ...verse,
        roles: verse.roles.map((role) => ({
          ...role,
          cue: { kind: "transition", value: "Hold the pickup." }
        }))
      },
      later
    ];

    const cue = resolveFirstLyricCue(song);
    expect(cue?.section.id).toBe("chorus-1");
    expect(cue?.lyric).toBe("stay up");
  });

  it("prefers the higher-priority lyric when two parts share a section", () => {
    const song = createDemoRehearsalSong();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: [
        {
          ...song.sections[0]!.roles[2]!,
          id: "backing-vocal",
          name: "Backing Vocal",
          rehearsalPriority: "low",
          cue: { kind: "lyric", value: "ooo" }
        },
        {
          ...song.sections[0]!.roles[2]!,
          id: "lead-vocal",
          name: "Lead Vocal",
          rehearsalPriority: "high",
          cue: { kind: "lyric", value: "city lights" }
        }
      ]
    };

    expect(resolveFirstLyricCue(song)?.role.id).toBe("lead-vocal");
  });

  it("skips non-finite starts, unknown priorities, and malformed lyric values", () => {
    const song = createDemoRehearsalSong();
    const invalidSection = structuredClone(song.sections[0]!);
    invalidSection.id = "invalid-start";
    invalidSection.timeRange = { start: Number.NaN, end: 20 };

    const validSection = structuredClone(song.sections[0]!);
    validSection.id = "valid-chorus";
    validSection.label = "chorus";
    validSection.timeRange = { start: 20, end: 50 };
    const invalidPriorityRole = {
      ...validSection.roles[2]!,
      id: "invalid-priority",
      cue: { kind: "lyric" as const, value: "ignore me" }
    };
    (invalidPriorityRole as unknown as { rehearsalPriority: string }).rehearsalPriority = "urgent";
    const invalidLyricRole = {
      ...validSection.roles[2]!,
      id: "invalid-lyric",
      rehearsalPriority: "medium" as const,
      cue: { kind: "lyric" as const, value: "placeholder" }
    };
    (invalidLyricRole.cue as unknown as { value: unknown }).value = 42;
    validSection.roles = [
      invalidPriorityRole,
      invalidLyricRole,
      {
        ...validSection.roles[2]!,
        id: "safe-lead",
        rehearsalPriority: "high",
        cue: { kind: "lyric", value: "safe lyric" }
      }
    ];

    song.sections = [invalidSection, validSection];

    const cue = resolveFirstLyricCue(song);
    expect(cue?.section.id).toBe("valid-chorus");
    expect(cue?.role.id).toBe("safe-lead");
    expect(cue?.lyric).toBe("safe lyric");
  });
});