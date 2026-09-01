import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillGrooveCopy, firstGrooveChange, isGrooveChangeTarget } from "./firstGrooveChange";

function cloneSong(song: RehearsalSong): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) => ({ ...role }))
    }))
  };
}

function appendSection(song: RehearsalSong, label: string, groove: string): RehearsalSong {
  const first = song.sections[0];
  return {
    ...song,
    sections: [
      ...song.sections,
      {
        ...first,
        id: `${label}-section`,
        label,
        groove,
        roles: first.roles.map((role) => ({ ...role, id: `${role.id}-${label}` }))
      }
    ]
  };
}

describe("firstGrooveChange", () => {
  it("holds the demo song's one named feel so the room does not reset the groove", () => {
    expect(firstGrooveChange(createDemoRehearsalSong())).toEqual({
      kind: "same",
      fromSectionLabel: "verse",
      fromGroove: "Straight eighths with a late snare feel",
      toSectionLabel: "verse",
      toGroove: "Straight eighths with a late snare feel"
    });
  });

  it("names the first consecutive feel change in form order", () => {
    const song = appendSection(
      appendSection(createDemoRehearsalSong(), "pre-chorus", "Straight eighths with a late snare feel"),
      "chorus",
      "Half-time snare with open hats"
    );

    expect(firstGrooveChange(song)).toEqual({
      kind: "change",
      fromSectionLabel: "pre-chorus",
      fromGroove: "Straight eighths with a late snare feel",
      toSectionLabel: "chorus",
      toGroove: "Half-time snare with open hats"
    });
  });

  it("skips unlabeled or none-groove sections until a named pair exists", () => {
    const song = cloneSong(createDemoRehearsalSong());
    song.sections[0] = { ...song.sections[0]!, label: " ", groove: "none" };
    const withChorus = appendSection(song, "chorus", "Half-time snare with open hats");
    const withBridge = appendSection(withChorus, "bridge", "Double-time ride");

    expect(firstGrooveChange(withBridge)).toEqual({
      kind: "change",
      fromSectionLabel: "chorus",
      fromGroove: "Half-time snare with open hats",
      toSectionLabel: "bridge",
      toGroove: "Double-time ride"
    });
  });

  it("trims groove text before deciding a change", () => {
    const song = appendSection(createDemoRehearsalSong(), "chorus", "  Straight eighths with a late snare feel  ");

    expect(firstGrooveChange(song)?.kind).toBe("same");
  });

  it("fails closed on malformed runtime roots and members", () => {
    expect(firstGrooveChange(null as unknown as RehearsalSong)).toBeNull();
    expect(firstGrooveChange({ sections: "nope" } as unknown as RehearsalSong)).toBeNull();
    expect(
      firstGrooveChange({
        ...createDemoRehearsalSong(),
        sections: [null, "skip", { label: "verse" }]
      } as unknown as RehearsalSong)
    ).toBeNull();
  });
});

describe("isGrooveChangeTarget", () => {
  it("marks only the arrival section as the next-action card", () => {
    const change: ReturnType<typeof firstGrooveChange> = {
      kind: "change",
      fromSectionLabel: "verse",
      fromGroove: "Straight eighths with a late snare feel",
      toSectionLabel: "chorus",
      toGroove: "Half-time snare with open hats"
    };

    expect(isGrooveChangeTarget(change, "chorus")).toBe(true);
    expect(isGrooveChangeTarget(change, " verse ")).toBe(false);
    expect(isGrooveChangeTarget(change, " ")).toBe(false);
  });
});

describe("fillGrooveCopy", () => {
  it("keeps rehearsal groove values literal while filling trusted tokens", () => {
    expect(
      fillGrooveCopy("Count {toGroove} before the {toSection}.", {
        toGroove: "Half-time {toSection}",
        toSection: "chorus"
      })
    ).toBe("Count Half-time {toSection} before the chorus.");
  });
});
