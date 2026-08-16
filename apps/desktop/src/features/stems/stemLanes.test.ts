import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { collectStemLanes, higherRehearsalPriority } from "./stemLanes";

describe("higherRehearsalPriority", () => {
  it("keeps the more urgent priority", () => {
    expect(higherRehearsalPriority("low", "medium")).toBe("medium");
    expect(higherRehearsalPriority("high", "medium")).toBe("high");
    expect(higherRehearsalPriority("medium", "medium")).toBe("medium");
  });
});

describe("collectStemLanes", () => {
  it("builds one lane per role from a real demo song", () => {
    const lanes = collectStemLanes(createDemoRehearsalSong());
    const bass = lanes.find((lane) => lane.roleId === "bass-guitar");

    expect(bass).toBeDefined();
    expect(bass?.roleName).toBe("Bass Guitar");
    expect(bass?.lowestNote).toBe("C#2");
    expect(bass?.highestNote).toBe("E3");
    expect(bass?.sectionLabels.length).toBeGreaterThan(0);
    expect(bass?.overlapWarnings.some((warning) => /keyboard/i.test(warning))).toBe(true);
  });

  it("merges the same role across sections without inventing playback files", () => {
    const song: RehearsalSong = {
      id: "merge-song",
      title: "Merge",
      sections: [
        {
          id: "verse-1",
          label: "verse",
          groove: "straight",
          timeRange: { start: 0, end: 8 },
          confidence: { level: "high", source: "model", notes: "stable" },
          roles: [
            {
              id: "bass-guitar",
              name: "   ",
              roleType: "instrument",
              harmony: { chord: "Am", functionLabel: "i", source: "model" },
              cue: { kind: "count", value: "1" },
              range: { lowestNote: "A1", highestNote: "A2" },
              confidence: { level: "medium", source: "model", notes: "check" },
              rehearsalPriority: "low",
              simplification: "roots",
              setupNote: "short",
              manualOverrides: [],
              overlapWarnings: ["  Density warning: keys  ", "Density warning: keys"]
            }
          ],
          partGraph: []
        },
        {
          id: "chorus-1",
          label: "chorus",
          groove: "open",
          timeRange: { start: 8, end: 16 },
          confidence: { level: "high", source: "model", notes: "stable" },
          roles: [
            {
              id: "bass-guitar",
              name: "Bass Guitar",
              roleType: "instrument",
              harmony: { chord: "C", functionLabel: "III", source: "model" },
              cue: { kind: "count", value: "1" },
              range: { lowestNote: "A1", highestNote: "C3" },
              confidence: { level: "medium", source: "model", notes: "check" },
              rehearsalPriority: "high",
              simplification: "roots",
              setupNote: "short",
              manualOverrides: [],
              overlapWarnings: ["Watch the kick"]
            }
          ],
          partGraph: []
        },
        {
          id: "blank-section",
          label: "   ",
          groove: "stop",
          timeRange: { start: 16, end: 18 },
          confidence: { level: "low", source: "model", notes: "short" },
          roles: [
            {
              id: "lead-vocal",
              name: "Lead Vocal",
              roleType: "vocal",
              harmony: { chord: "C", functionLabel: "melody", source: "model" },
              cue: { kind: "lyric", value: "hold" },
              range: { lowestNote: "C4", highestNote: "G4" },
              confidence: { level: "medium", source: "model", notes: "check" },
              rehearsalPriority: "medium",
              simplification: "hum",
              setupNote: "close mic",
              manualOverrides: [],
              overlapWarnings: []
            }
          ],
          partGraph: []
        }
      ],
      exportSummary: { format: "cue-sheet", headline: "Lock bass first", focusSections: ["verse"] }
    };

    const lanes = collectStemLanes(song);
    expect(lanes).toHaveLength(2);

    const bass = lanes[0];
    expect(bass.roleName).toBe("Bass Guitar");
    expect(bass.rehearsalPriority).toBe("high");
    expect(bass.sectionLabels).toEqual(["verse", "chorus"]);
    expect(bass.overlapWarnings).toEqual(["Density warning: keys", "Watch the kick"]);

    const vocal = lanes[1];
    expect(vocal.roleId).toBe("lead-vocal");
    expect(vocal.sectionLabels).toEqual([]);
  });

  it("falls back to the role id when the display name is blank", () => {
    const song = createDemoRehearsalSong();
    song.sections = [
      {
        ...song.sections[0],
        roles: [
          {
            ...song.sections[0].roles[0],
            id: "unnamed-role",
            name: "  "
          }
        ]
      }
    ];

    expect(collectStemLanes(song)[0]?.roleName).toBe("unnamed-role");
  });
});
