import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstStopCallout } from "./FirstStopCallout";

function songWithLocalizedStop() {
  const song = createDemoRehearsalSong();
  const section = song.sections[0]!;
  const role = {
    ...section.roles[0]!,
    id: "keyboard-stop",
    name: "피아노",
    rehearsalPriority: "high" as const
  };
  section.id = "localized-stop";
  section.label = "stop";
  section.timeRange = { start: 10, end: 12 };
  section.roles = [role];
  section.partGraph = [
    {
      role_id: role.id,
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  return song;
}

describe("FirstStopCallout runtime and locale boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contains a malformed runtime song root instead of crashing the callout", () => {
    render(<FirstStopCallout song={null as unknown as RehearsalSong} />);

    expect(
      screen.getByText("No stop yet. Stay on tonight's map until a cut is marked.")
    ).toBeTruthy();
  });

  it("uses particle-safe Korean section-form copy instead of exposing the raw stop enum", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<FirstStopCallout song={songWithLocalizedStop()} />);

    expect(screen.getByText("0:10 스톱에서 피아노 파트가 컷합니다.")).toBeTruthy();
    expect(screen.queryByText("피아노이 0:10 스톱에서 컷합니다.")).toBeNull();
    expect(screen.queryByText(/ stop에서 /)).toBeNull();
  });
});
