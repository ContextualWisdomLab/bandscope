import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { FirstDropPlanCallout } from "./FirstDropPlanCallout";

function songWithCustomDropPlan(source: "model" | "user" | undefined, text: string) {
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
  vocal.dropPlan = text;
  if (source) {
    vocal.dropPlanSource = source;
  }
  song.sections = [verse, chorus];
  return song;
}

describe("FirstDropPlanCallout custom guidance", () => {
  it("preserves user-authored drop guidance verbatim", () => {
    render(
      <FirstDropPlanCallout
        song={songWithCustomDropPlan("user", "Come in on the snare; don't rush the last eighth.")}
      />
    );
    expect(screen.getByText("Come in on the snare; don't rush the last eighth.")).toBeTruthy();
  });

  it("preserves custom copy without model provenance instead of rewriting it", () => {
    render(
      <FirstDropPlanCallout
        song={songWithCustomDropPlan(undefined, "Stack the last bar and land together.")}
      />
    );
    expect(screen.getByText("Stack the last bar and land together.")).toBeTruthy();
  });
});
