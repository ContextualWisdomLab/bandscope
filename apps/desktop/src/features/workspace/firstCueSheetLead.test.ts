import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../../i18n";
import { firstCueSheetLead } from "./firstCueSheetLead";

describe("firstCueSheetLead", () => {
  const t = createTranslator("en");

  it("leads with the first clashing span and the instrument-check next action", () => {
    expect(firstCueSheetLead(createDemoRehearsalSong(), null, t)).toEqual({
      section: "Tonight first",
      groove: "Straight eighths with a late snare feel",
      role: "Bass Guitar",
      harmony: "C#m7",
      cue: "Hold through the pickup before the downbeat.",
      priority: "high",
      notes: "Bass Guitar sits C#2–E3 in verse. Hear that clash on your instrument before the verse."
    });
  });

  it("limits the lead row to the selected part", () => {
    const lead = firstCueSheetLead(createDemoRehearsalSong(), "lead-vocal", t);

    expect(lead?.role).toBe("Lead Vocal");
    expect(lead?.harmony).toBe("C#m7");
    expect(lead?.notes).toBe(
      "Lead Vocal sits G#3–C#5 in verse. Hear that clash on your instrument before the verse."
    );
  });

  it("uses the check copy when the first span has no clash", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role) => ({
      ...role,
      overlapWarnings: []
    }));

    expect(firstCueSheetLead(song, null, t)?.notes).toBe(
      "Bass Guitar sits C#2–E3 in verse. Check that span on your instrument before the verse."
    );
  });

  it("returns null when no named span exists", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role) => ({
      ...role,
      range: { lowestNote: "", highestNote: "none" },
      overlapWarnings: []
    }));

    expect(firstCueSheetLead(song, null, t)).toBeNull();
  });

  it("fails closed on malformed runtime collections after a squeeze match is impossible", () => {
    expect(firstCueSheetLead(null as unknown as RehearsalSong, null, t)).toBeNull();
  });

  it("keeps formula-shaped harmony literal so CSV escaping can neutralize it later", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      harmony: { chord: "=Cmaj7", functionLabel: "vi pedal anchor", source: "model" }
    };

    expect(firstCueSheetLead(song, "bass-guitar", t)?.harmony).toBe("=Cmaj7");
  });
});
