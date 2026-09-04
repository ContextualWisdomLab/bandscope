import { createDemoRehearsalSong, type RehearsalRole } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupHandoff } from "./firstPickupHandoff";

describe("resolveFirstPickupHandoff role display authority", () => {
  it("does not select a higher-priority active role whose runtime name is not usable copy", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const invalidHigh = {
      ...section.roles[0]!,
      id: "invalid-high",
      name: 42,
      rehearsalPriority: "high"
    } as unknown as RehearsalRole;
    const validMedium = {
      ...section.roles[2]!,
      id: "valid-medium",
      name: "Lead Vocal",
      rehearsalPriority: "medium"
    } satisfies RehearsalRole;
    section.label = "pickup";
    section.roles = [invalidHigh, validMedium];
    section.partGraph = [
      { role_id: invalidHigh.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: validMedium.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    song.sections = [section];

    expect(resolveFirstPickupHandoff(song)?.toRole.id).toBe(validMedium.id);
  });
});
