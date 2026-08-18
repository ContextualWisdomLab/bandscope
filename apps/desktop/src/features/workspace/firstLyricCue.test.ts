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
});
