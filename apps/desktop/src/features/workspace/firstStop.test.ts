import { createDemoRehearsalSong, type RehearsalSong, type RehearsalSection } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillStopCopy, firstStop, isStopTarget, stopCopyValues } from "./firstStop";

function cloneSong(song: RehearsalSong): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) => ({ ...role }))
    }))
  };
}

function withSections(song: RehearsalSong, sections: RehearsalSection[]): RehearsalSong {
  return { ...song, sections };
}

function namedSection(base: RehearsalSection, id: string, label: RehearsalSection["label"]): RehearsalSection {
  return {
    ...base,
    id,
    label,
    roles: base.roles.map((role) => ({ ...role, id: `${role.id}-${id}` }))
  };
}

describe("firstStop", () => {
  it("returns null on the demo song so the map asks for an ear check", () => {
    expect(firstStop(createDemoRehearsalSong())).toBeNull();
  });

  it("names the first form-labeled stop and the sections around it", () => {
    const verse = createDemoRehearsalSong().sections[0]!;
    const song = withSections(createDemoRehearsalSong(), [
      namedSection(verse, "verse-1", "verse"),
      namedSection(verse, "stop-1", "stop"),
      namedSection(verse, "chorus-1", "chorus")
    ]);

    expect(firstStop(song)).toEqual({
      sectionId: "stop-1",
      sectionLabel: "stop",
      previousSectionLabel: "verse",
      nextSectionLabel: "chorus"
    });
  });

  it("skips earlier non-stop sections and keeps the first stop only", () => {
    const verse = createDemoRehearsalSong().sections[0]!;
    const song = withSections(createDemoRehearsalSong(), [
      namedSection(verse, "intro-1", "intro"),
      namedSection(verse, "verse-1", "verse"),
      namedSection(verse, "stop-1", "stop"),
      namedSection(verse, "stop-2", "stop"),
      namedSection(verse, "chorus-1", "chorus")
    ]);

    expect(firstStop(song)?.sectionId).toBe("stop-1");
  });

  it("omits previous or next labels when those neighbors are unnamed", () => {
    const verse = createDemoRehearsalSong().sections[0]!;
    const song = withSections(createDemoRehearsalSong(), [
      { ...namedSection(verse, "verse-1", "verse"), label: "verse" },
      namedSection(verse, "stop-1", "stop")
    ]);
    song.sections[0] = { ...song.sections[0]!, label: "none" as RehearsalSection["label"] };

    expect(firstStop(song)).toEqual({
      sectionId: "stop-1",
      sectionLabel: "stop",
      previousSectionLabel: undefined,
      nextSectionLabel: undefined
    });
  });

  it("does not invent a stop from groove or cue wording", () => {
    const song = cloneSong(createDemoRehearsalSong());
    song.sections[0] = {
      ...song.sections[0]!,
      groove: "Stop-time hits on beat 4",
      roles: song.sections[0]!.roles.map((role) => ({
        ...role,
        cue: { kind: "transition", value: "Cut together on the stop." }
      }))
    };

    expect(firstStop(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots and members", () => {
    expect(firstStop(null as unknown as RehearsalSong)).toBeNull();
    expect(firstStop({ sections: "nope" } as unknown as RehearsalSong)).toBeNull();
    expect(
      firstStop({
        ...createDemoRehearsalSong(),
        sections: [null, "skip", { label: "stop" }]
      } as unknown as RehearsalSong)
    ).toBeNull();
  });

  it("fails closed when a section identity is missing", () => {
    const song = cloneSong(createDemoRehearsalSong());
    song.sections[0] = { ...song.sections[0]!, id: " " };

    expect(firstStop(song)).toBeNull();
  });

  it("fails closed when repeated section ids cannot identify one destination card", () => {
    const verse = createDemoRehearsalSong().sections[0]!;
    const song = withSections(createDemoRehearsalSong(), [
      namedSection(verse, "duplicate", "verse"),
      namedSection(verse, "duplicate", "stop")
    ]);

    expect(firstStop(song)).toBeNull();
  });

  it("trims labels before matching the stop form", () => {
    const verse = createDemoRehearsalSong().sections[0]!;
    const song = withSections(createDemoRehearsalSong(), [
      namedSection(verse, "verse-1", "verse"),
      { ...namedSection(verse, "stop-1", "stop"), label: "  stop  " as RehearsalSection["label"] },
      namedSection(verse, "chorus-1", "chorus")
    ]);

    expect(firstStop(song)).toEqual({
      sectionId: "stop-1",
      sectionLabel: "stop",
      previousSectionLabel: "verse",
      nextSectionLabel: "chorus"
    });
  });
});

describe("fillStopCopy", () => {
  it("fills own-property tokens once and leaves unknown tokens literal", () => {
    expect(
      fillStopCopy("Cut together in {sectionLabel} after {previousSectionLabel}.", {
        sectionLabel: "stop",
        previousSectionLabel: "verse"
      })
    ).toBe("Cut together in stop after verse.");
    expect(fillStopCopy("Keep {toString}", { sectionLabel: "stop" })).toBe("Keep {toString}");
  });
});

describe("isStopTarget", () => {
  it("matches only the named stop identity", () => {
    const stop = {
      sectionId: "stop-1",
      sectionLabel: "stop",
      previousSectionLabel: "verse",
      nextSectionLabel: "chorus"
    };

    expect(isStopTarget(stop, "stop-1")).toBe(true);
    expect(isStopTarget(stop, " verse-1 ")).toBe(false);
    expect(isStopTarget(stop, " ")).toBe(false);
  });
});

describe("stopCopyValues", () => {
  it("exposes empty neighbor tokens when those labels are missing", () => {
    expect(
      stopCopyValues({
        sectionId: "stop-1",
        sectionLabel: "stop"
      })
    ).toEqual({
      sectionLabel: "stop",
      previousSectionLabel: "",
      nextSectionLabel: ""
    });
  });
});
