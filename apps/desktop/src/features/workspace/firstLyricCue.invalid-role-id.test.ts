import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstLyricCue } from "./firstLyricCue";

describe("resolveFirstLyricCue runtime role identity", () => {
  it("ignores a lyric role whose runtime id is not a non-empty string", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);

    const safeRole = {
      ...section.roles[0]!,
      id: "safe-vocal",
      name: "Safe Vocal",
      rehearsalPriority: "medium" as const,
      cue: { kind: "lyric" as const, value: "safe lyric" }
    };
    const malformedRole = {
      ...section.roles[2]!,
      id: 42 as unknown as string,
      name: "Malformed Runtime Role",
      rehearsalPriority: "high" as const,
      cue: { kind: "lyric" as const, value: "unsafe lyric" }
    };

    section.roles = [safeRole, malformedRole];
    song.sections = [section];

    const cue = resolveFirstLyricCue(song);
    expect(cue?.role.id).toBe("safe-vocal");
    expect(cue?.lyric).toBe("safe lyric");
  });
});
