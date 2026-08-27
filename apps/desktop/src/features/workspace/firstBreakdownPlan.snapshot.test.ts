import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstBreakdownPlan } from "./firstBreakdownPlan";

describe("resolveFirstBreakdownPlan descriptor snapshots", () => {
  it("uses the breakdown-plan snapshot that admitted the role", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    const chorus = structuredClone(verse);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
    const role = chorus.roles.find((candidate) => candidate.id === "bass-guitar")!;
    const roleId = role.id;
    let breakdownPlanDescriptorReads = 0;
    const proxiedRole = new Proxy(role, {
      getOwnPropertyDescriptor(target, key) {
        if (key === "breakdownPlan") {
          breakdownPlanDescriptorReads += 1;
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value:
              breakdownPlanDescriptorReads === 1
                ? "Hold this breakdown; keep it sparse until the drop."
                : "Changed after validation."
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      }
    });
    chorus.roles = chorus.roles.map((candidate) =>
      candidate.id === roleId ? proxiedRole : candidate
    );
    chorus.partGraph = chorus.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === roleId
    }));
    song.sections = [verse, chorus];

    expect(resolveFirstBreakdownPlan(song)?.breakdownPlan).toBe(
      "Hold this breakdown; keep it sparse until the drop."
    );
    expect(breakdownPlanDescriptorReads).toBe(1);
  });
});
