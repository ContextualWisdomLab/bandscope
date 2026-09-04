import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstDropPlan } from "./firstDropPlan";

describe("resolveFirstDropPlan proxy authority", () => {
  it("does not read inherited or Proxy-substituted dropPlan as rehearsal copy", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    verse.partGraph = verse.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === "bass-guitar" || node.role_id === "keys-right"
    }));
    const chorus = structuredClone(verse);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
    chorus.partGraph = chorus.partGraph.map((node) => ({ ...node, is_active: true }));
    const vocal = chorus.roles.find((role) => role.id === "lead-vocal")!;
    const hostile = new Proxy(vocal, {
      get(_target, property) {
        if (property === "dropPlan") {
          return "Hit this drop; come in together when the texture fills.";
        }
        return Reflect.get(_target, property);
      }
    });
    chorus.roles = chorus.roles.map((role) => (role.id === "lead-vocal" ? hostile : role));
    song.sections = [verse, chorus];
    expect(resolveFirstDropPlan(song)).toBeNull();
  });
});
