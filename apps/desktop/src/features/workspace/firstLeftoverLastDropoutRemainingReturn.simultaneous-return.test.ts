import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstLeftoverLastDropoutRemainingReturn } from "./firstLeftoverLastDropoutRemainingReturn";

/** Build a section fixture that keeps role identity stable while changing only activity evidence. */
function sectionWithInactiveRoles(
  template: RehearsalSong["sections"][number],
  id: string,
  label: string,
  start: number,
  inactiveRoleIds: readonly string[]
): RehearsalSong["sections"][number] {
  const inactive = new Set(inactiveRoleIds);
  return {
    ...template,
    id,
    label: label as RehearsalSong["sections"][number]["label"],
    timeRange: { start, end: start + 20 },
    partGraph: template.partGraph.map((node) => ({
      ...node,
      is_active: !inactive.has(node.role_id)
    }))
  };
}

/** Build a sequence whose final two still-out roles return in the same section. */
function simultaneousRemainingReturnSong(): RehearsalSong {
  const seed = createDemoRehearsalSong();
  const template = seed.sections[0]!;
  return {
    ...seed,
    sections: [
      sectionWithInactiveRoles(template, "verse-1", "verse", 0, [
        "bass-guitar",
        "keys-right",
        "lead-vocal"
      ]),
      sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [
        "keys-right",
        "lead-vocal"
      ]),
      sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["lead-vocal"]),
      sectionWithInactiveRoles(template, "outro-1", "outro", 60, []),
      sectionWithInactiveRoles(template, "tag-1", "tag", 80, [
        "bass-guitar",
        "keys-right",
        "lead-vocal"
      ]),
      sectionWithInactiveRoles(template, "coda-1", "coda", 100, [
        "bass-guitar",
        "keys-right"
      ]),
      sectionWithInactiveRoles(template, "ending-1", "ending", 120, [])
    ]
  };
}

describe("firstLeftoverLastDropoutRemainingReturn simultaneous return", () => {
  it("fails closed when multiple still-out roles return together without a selected role", () => {
    expect(firstLeftoverLastDropoutRemainingReturn(simultaneousRemainingReturnSong())).toBeNull();
  });

  it("returns the selected role when that role is one of simultaneous returners", () => {
    expect(
      firstLeftoverLastDropoutRemainingReturn(simultaneousRemainingReturnSong(), "keys-right")
    ).toEqual({
      sectionLabel: "ending",
      remainingSectionLabel: "coda",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "keys-right",
      remainingRoleName: "Keys (Right Hand)",
      returningRoleId: "keys-right",
      returningRoleName: "Keys (Right Hand)"
    });
  });

  it("fails closed when the selected role cannot disambiguate simultaneous returners", () => {
    expect(
      firstLeftoverLastDropoutRemainingReturn(simultaneousRemainingReturnSong(), "lead-vocal")
    ).toBeNull();
  });
});
