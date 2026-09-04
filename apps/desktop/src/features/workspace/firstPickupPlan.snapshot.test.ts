import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupPlan } from "./firstPickupPlan";

describe("resolveFirstPickupPlan descriptor snapshots", () => {
  it("uses the pickup-plan snapshot that admitted the role", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    const role = section.roles[0]!;
    const companion = section.roles[2]!;
    const roleId = role.id;
    let pickupPlanDescriptorReads = 0;
    const proxiedRole = new Proxy(role, {
      getOwnPropertyDescriptor(target, key) {
        if (key === "pickupPlan") {
          pickupPlanDescriptorReads += 1;
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value:
              pickupPlanDescriptorReads === 1
                ? "Play this pickup with Lead Vocal; land the downbeat together."
                : "Changed after validation."
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      }
    });

    const previous = structuredClone({
      ...section,
      roles: [role, companion],
      partGraph: [
        { role_id: roleId, is_active: false, handoff_to: [], handoff_from: [] },
        { role_id: companion.id, is_active: true, handoff_to: [], handoff_from: [] }
      ]
    });
    previous.id = "pickup-rest";
    previous.label = "intro";
    previous.timeRange = { start: 0, end: section.timeRange.start };
    previous.roles = previous.roles.map((candidate) => {
      const clone = { ...candidate };
      delete clone.pickupPlan;
      delete clone.pickupPlanSource;
      return clone;
    });

    section.roles = [proxiedRole, companion];
    delete companion.pickupPlan;
    delete companion.pickupPlanSource;
    section.partGraph = [
      { role_id: roleId, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: companion.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    song.sections = [previous, section];

    expect(resolveFirstPickupPlan(song)?.pickupPlan).toBe(
      "Play this pickup with Lead Vocal; land the downbeat together."
    );
    expect(pickupPlanDescriptorReads).toBe(1);
  });
});
