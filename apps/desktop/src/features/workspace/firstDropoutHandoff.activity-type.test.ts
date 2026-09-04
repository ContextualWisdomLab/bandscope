import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstDropoutHandoff } from "./firstDropoutHandoff";

const runtimeStringFalse = "false" as unknown as boolean;

describe("resolveFirstDropoutHandoff activity-type authority", () => {
  it("does not treat a string false flag as an active dropout source", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    section.partGraph = section.partGraph.map((node) =>
      node.role_id === "bass-guitar" ? { ...node, is_active: runtimeStringFalse } : node
    );

    expect(resolveFirstDropoutHandoff(song)).toBeNull();
  });
});
