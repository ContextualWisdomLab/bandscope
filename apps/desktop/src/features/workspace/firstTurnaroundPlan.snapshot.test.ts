import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTurnaroundPlan } from "./firstTurnaroundPlan";

describe("resolveFirstTurnaroundPlan descriptor snapshots", () => {
  it("uses the turnaround-plan snapshot that admitted the role", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const role = section.roles[0]!;
    const roleId = role.id;
    const companion = structuredClone(section.roles[2]!);
    delete companion.turnaroundPlan;
    delete companion.turnaroundPlanSource;
    section.roles = [role, companion];
    section.partGraph = [
      { role_id: roleId, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: companion.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const continuation = structuredClone(section);
    continuation.id = "chorus-1";
    continuation.label = "chorus";
    continuation.timeRange = { start: 30, end: 50 };
    continuation.roles = continuation.roles.map((continuingRole) => {
      const clone = structuredClone(continuingRole);
      delete clone.turnaroundPlan;
      delete clone.turnaroundPlanSource;
      return clone;
    });
    continuation.partGraph = continuation.partGraph.map((node) => ({
      ...node,
      is_active: true
    }));

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
    section.roles = [proxiedRole, companion];
    song.sections = [section, continuation];

    expect(resolveFirstTurnaroundPlan(song)?.turnaroundPlan).toBe(
      "Turn these last bars with Lead Vocal; land the downbeat together."
    );
    expect(turnaroundPlanDescriptorReads).toBe(1);
  });
});
