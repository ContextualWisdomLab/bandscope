import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupHandoff } from "./firstPickupHandoff";

describe("resolveFirstPickupHandoff section-local identity authority", () => {
  it("rejects a labeled pickup when the selected role identity is duplicated", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const selectedRole = section.roles[2]!;
    section.label = "pickup";
    section.roles = [selectedRole, { ...selectedRole, name: "Duplicate Lead" }];
    section.partGraph = [
      {
        role_id: selectedRole.id,
        is_active: true,
        handoff_to: [],
        handoff_from: []
      }
    ];
    song.sections = [section];

    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });

  it("rejects a labeled pickup when graph authority for the selected role is duplicated", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const selectedRole = section.roles[2]!;
    const activeNode = {
      role_id: selectedRole.id,
      is_active: true,
      handoff_to: [],
      handoff_from: []
    };
    section.label = "pickup";
    section.roles = [selectedRole];
    section.partGraph = [activeNode, { ...activeNode }];
    song.sections = [section];

    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });
});
