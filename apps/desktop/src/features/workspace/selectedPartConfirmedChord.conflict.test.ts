import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { selectedPartConfirmedChord } from "./selectedPartConfirmedChord";

describe("selectedPartConfirmedChord conflicting overrides", () => {
  it("fails closed when one selected role has two different user-confirmed harmony chords", () => {
    const song = createDemoRehearsalSong();
    const leadVocal = song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!;
    leadVocal.manualOverrides = [
      {
        field: "harmony",
        value: { chord: "C#m11", functionLabel: "room confirmation", source: "user" },
        source: "user"
      },
      {
        field: "harmony",
        value: { chord: "Bmaj7", functionLabel: "conflicting confirmation", source: "user" },
        source: "user"
      }
    ];

    expect(selectedPartConfirmedChord(song, "lead-vocal")).toBeNull();
  });

  it("accepts repeated copies of the same user-confirmed chord", () => {
    const song = createDemoRehearsalSong();
    const leadVocal = song.sections[0]!.roles.find((role) => role.id === "lead-vocal")!;
    leadVocal.manualOverrides = [
      ...(leadVocal.manualOverrides ?? []),
      ...(leadVocal.manualOverrides ?? [])
    ];

    expect(selectedPartConfirmedChord(song, "lead-vocal")).toEqual({
      sectionLabel: "verse",
      roleName: "Lead Vocal",
      chord: "C#m11"
    });
  });
});
