import {
  MAX_SECTION_TIME_SECONDS,
  createDemoRehearsalSong,
  type RehearsalSong
} from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstDropoutHandoff } from "./firstDropoutHandoff";

function runtimeSong(value: unknown): RehearsalSong {
  return value as RehearsalSong;
}

function songWithLaterValidDropout() {
  const song = createDemoRehearsalSong();
  const valid = structuredClone(song.sections[0]!);
  valid.id = "later-valid-dropout";
  valid.label = "chorus";
  valid.timeRange = { start: 40, end: 70 };
  return { song, valid };
}

describe("first dropout runtime boundary", () => {
  it.each([null, 42])("fails closed when the runtime song root is %s", (value) => {
    const song = runtimeSong(value);

    expect(() => resolveFirstDropoutHandoff(song)).not.toThrow();
    expect(resolveFirstDropoutHandoff(song)).toBeNull();
  });

  it("fails closed when the runtime section collection is not an array", () => {
    const song = createDemoRehearsalSong();
    (song as unknown as { sections: unknown }).sections = null;

    expect(() => resolveFirstDropoutHandoff(song)).not.toThrow();
    expect(resolveFirstDropoutHandoff(song)).toBeNull();
  });

  it("rejects sparse section evidence instead of skipping the missing entry", () => {
    const song = createDemoRehearsalSong();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;

    expect(resolveFirstDropoutHandoff(song)).toBeNull();
  });

  it("ignores malformed section elements and preserves a later valid dropout", () => {
    const { song, valid } = songWithLaterValidDropout();
    song.sections = [null, valid] as unknown as typeof song.sections;

    expect(resolveFirstDropoutHandoff(song)?.section.id).toBe("later-valid-dropout");
  });

  it.each([
    { start: 10, end: 10 },
    { start: 10.5, end: 11.5 },
    null
  ])("rejects an invalid runtime window %j and preserves a later valid dropout", (timeRange) => {
    const { song, valid } = songWithLaterValidDropout();
    const invalid = structuredClone(valid);
    invalid.id = "invalid-window";
    invalid.timeRange = timeRange as typeof invalid.timeRange;
    song.sections = [invalid, valid];

    expect(resolveFirstDropoutHandoff(song)?.section.id).toBe("later-valid-dropout");
  });

  it("rejects a dropout window above the shared section-time ceiling", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = {
      start: MAX_SECTION_TIME_SECONDS,
      end: MAX_SECTION_TIME_SECONDS + 1
    };

    expect(resolveFirstDropoutHandoff(song)).toBeNull();
  });

  it("fails a section closed when role or graph collections are sparse", () => {
    const roleSparseSong = createDemoRehearsalSong();
    const roleSection = roleSparseSong.sections[0]!;
    const sparseRoles: typeof roleSection.roles = new Array(roleSection.roles.length + 1);
    roleSection.roles.forEach((role, index) => {
      sparseRoles[index + 1] = role;
    });
    roleSection.roles = sparseRoles;

    const graphSparseSong = createDemoRehearsalSong();
    const graphSection = graphSparseSong.sections[0]!;
    const sparseGraph: typeof graphSection.partGraph = new Array(graphSection.partGraph.length + 1);
    graphSection.partGraph.forEach((node, index) => {
      sparseGraph[index + 1] = node;
    });
    graphSection.partGraph = sparseGraph;

    expect(() => resolveFirstDropoutHandoff(roleSparseSong)).not.toThrow();
    expect(resolveFirstDropoutHandoff(roleSparseSong)).toBeNull();
    expect(() => resolveFirstDropoutHandoff(graphSparseSong)).not.toThrow();
    expect(resolveFirstDropoutHandoff(graphSparseSong)).toBeNull();
  });

  it("rejects sparse handoff edge collections as incomplete evidence", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const outgoing = section.partGraph.find((node) => node.role_id === "bass-guitar")!;
    const incoming = section.partGraph.find((node) => node.role_id === "lead-vocal")!;
    const sparseTo: string[] = new Array(2);
    sparseTo[1] = "lead-vocal";
    const sparseFrom: string[] = new Array(2);
    sparseFrom[1] = "bass-guitar";
    outgoing.handoff_to = sparseTo;
    incoming.handoff_from = sparseFrom;

    expect(resolveFirstDropoutHandoff(song)).toBeNull();
  });

  it("rejects a buyer-visible holder whose runtime name is not a non-empty string", () => {
    const song = createDemoRehearsalSong();
    const bass = song.sections[0]!.roles.find((role) => role.id === "bass-guitar")!;
    (bass as unknown as { name: unknown }).name = { secret: "not-copy" };

    expect(resolveFirstDropoutHandoff(song)).toBeNull();
  });
});
