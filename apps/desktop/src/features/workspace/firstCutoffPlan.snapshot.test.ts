import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstCutoffPlan } from "./firstCutoffPlan";

describe("resolveFirstCutoffPlan descriptor snapshots", () => {
  it("uses the cutoff-plan snapshot that admitted the role", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const role = section.roles[0]!;
    const roleId = role.id;
    let cutoffPlanDescriptorReads = 0;
    const proxiedRole = new Proxy(role, {
      getOwnPropertyDescriptor(target, key) {
        if (key === "cutoffPlan") {
          cutoffPlanDescriptorReads += 1;
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value:
              cutoffPlanDescriptorReads === 1
                ? "Cut this off with Lead Vocal; don't linger past the last beat."
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

    expect(resolveFirstCutoffPlan(song)?.cutoffPlan).toBe(
      "Cut this off with Lead Vocal; don't linger past the last beat."
    );
    expect(cutoffPlanDescriptorReads).toBe(1);
  });
});
