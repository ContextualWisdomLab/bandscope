import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../../i18n";
import { firstChartAction } from "./firstChartAction";

describe("firstChartAction", () => {
  const t = createTranslator("en");

  it("leads with the first clashing span and the instrument-check next action", () => {
    expect(firstChartAction(createDemoRehearsalSong(), null, t)).toEqual({
      section: "verse",
      role: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3",
      next: "Bass Guitar sits C#2–E3 in verse. Hear that clash on your instrument before the verse."
    });
  });

  it("limits the lead to the selected part", () => {
    const action = firstChartAction(createDemoRehearsalSong(), "lead-vocal", t);

    expect(action?.role).toBe("Lead Vocal");
    expect(action?.lowestNote).toBe("G#3");
    expect(action?.highestNote).toBe("C#5");
    expect(action?.next).toBe(
      "Lead Vocal sits G#3–C#5 in verse. Hear that clash on your instrument before the verse."
    );
  });

  it("uses the check copy when the first span has no clash", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role) => ({
      ...role,
      overlapWarnings: []
    }));

    expect(firstChartAction(song, null, t)?.next).toBe(
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

    expect(firstChartAction(song, null, t)).toBeNull();
  });

  it("fails closed on malformed runtime collections", () => {
    expect(firstChartAction(null as unknown as RehearsalSong, null, t)).toBeNull();
  });

  it("keeps formula-shaped role names literal so JSON encoding can neutralize them later", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      name: "=HYPERLINK(\"http://evil\")"
    };

    expect(firstChartAction(song, "bass-guitar", t)).toMatchObject({
      role: "=HYPERLINK(\"http://evil\")",
      next: "=HYPERLINK(\"http://evil\") sits C#2–E3 in verse. Hear that clash on your instrument before the verse."
    });
  });
});
