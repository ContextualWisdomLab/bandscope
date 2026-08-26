import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTurnaroundPlan } from "./firstTurnaroundPlan";

describe("resolveFirstTurnaroundPlan descriptor snapshots", () => {
  it("uses the turnaround-plan snapshot that admitted the role", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const role = section.roles[0]!;
    const roleId = role.id;
    let turnaroundPlanDescriptorReads = 0;
    const proxiedRole = new Proxy(role, {
      getOwnPropertyDescriptor(target, key) {
        if (key === "turnaroundPlan") {
          turnaroundPlanDescriptorReads += 1;
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value:
              turnaroundPlanDescriptorReads === 1
                ? "Turn these last bars with Lead Vocal; land the downbeat together."
                : "Changed after validation."
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      }
    });

    section.roles = [proxiedRole];
    section.partGraph = [
      { role_id: roleId, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    song.sections = [section];

    expect(resolveFirstTurnaroundPlan(song)?.turnaroundPlan).toBe(
      "Turn these last bars with Lead Vocal; land the downbeat together."
    );
    expect(turnaroundPlanDescriptorReads).toBe(1);
  });
});
