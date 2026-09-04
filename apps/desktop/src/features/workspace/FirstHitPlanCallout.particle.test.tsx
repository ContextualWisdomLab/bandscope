import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHitPlanCallout } from "./FirstHitPlanCallout";

describe("FirstHitPlanCallout Korean role copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps vowel-ending role names particle-safe before and after the hit action", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        hitPlan: "Land this hit with Lead Vocal on the verse downbeat; don't drift past the pickup.",
        hitPlanSource: "user"
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    const grid = document.createElement("div");
    grid.dataset.testid = "song-structure-grid";
    grid.setAttribute("role", "region");
    grid.setAttribute("aria-label", "Scrollable song structure timeline");
    const target = document.createElement("div");
    target.dataset.sectionIndex = "0";
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });
    grid.appendChild(target);
    document.body.appendChild(grid);

    render(<FirstHitPlanCallout song={song} />);

    expect(screen.getByText("0:10 벌스에서 피아노 파트의 히트 계획이 있습니다.")).toBeTruthy();
    expect(screen.queryByText(/피아노이/)).toBeNull();
    expect(screen.queryByText(/피아노가/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0:10 피아노 히트 열기" }));

    expect(screen.getByText("0:10에서 피아노 파트의 히트를 맞춘 다음 합주를 시작하세요.")).toBeTruthy();
    expect(screen.queryByText(/피아노과/)).toBeNull();

    grid.remove();
  });

  it("localizes the analysis-engine hit template instead of exposing English guidance", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        hitPlan: "Land this hit with Lead Vocal; don't drift past the downbeat.",
        hitPlanSource: "model"
      },
      {
        ...seed.roles[2]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "medium"
      }
    ];
    seed.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    render(<FirstHitPlanCallout song={song} />);

    expect(
      screen.getByText("Lead Vocal 파트와 이 히트를 맞추세요. 다운비트 뒤로 밀리지 마세요.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Land this hit with Lead Vocal; don't drift past the downbeat.")
    ).toBeNull();
  });

  it("localizes the rest-of-band hit template instead of exposing English guidance", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        hitPlan: "Land this hit with the rest of the band; don't drift past the downbeat.",
        hitPlanSource: "model"
      }
    ];
    seed.partGraph = [{ role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] }];

    render(<FirstHitPlanCallout song={song} />);

    expect(
      screen.getByText("나머지 밴드와 이 히트를 맞추세요. 다운비트 뒤로 밀리지 마세요.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Land this hit with the rest of the band; don't drift past the downbeat.")
    ).toBeNull();
  });

  it("preserves the generated template shape when long target names are bounded", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const targetRole = `Lead-${"A".repeat(180)}`;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        hitPlan: `Land this hit with ${targetRole}; don't drift past the downbeat.`,
        hitPlanSource: "model"
      },
      {
        ...seed.roles[2]!,
        id: "long-part",
        name: targetRole,
        rehearsalPriority: "medium"
      }
    ];
    seed.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "long-part", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    render(<FirstHitPlanCallout song={song} />);

    expect(screen.queryByText(/^Land this hit with /)).toBeNull();
    expect(
      screen.getByText(
        (content) =>
          content.startsWith("Lead-") && content.endsWith("파트와 이 히트를 맞추세요. 다운비트 뒤로 밀리지 마세요.")
      )
    ).toBeTruthy();
  });

  it("keeps a short generated prefix verbatim instead of inferring a lineup target", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        hitPlan: "Land this hit with Lead; don't drift past the downbeat.",
        hitPlanSource: "model"
      },
      {
        ...seed.roles[2]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "medium"
      }
    ];
    seed.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    render(<FirstHitPlanCallout song={song} />);

    expect(screen.getByText("Land this hit with Lead; don't drift past the downbeat.")).toBeTruthy();
    expect(screen.queryByText("Lead 파트와 이 히트를 맞추세요. 다운비트 뒤로 밀리지 마세요.")).toBeNull();
  });

  it("fails closed when a bounded generated target matches multiple long lineup names", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const targetRole = `Lead-${"A".repeat(180)}`;
    seed.roles = [
      {
        ...seed.roles[2]!,
        id: "piano",
        name: "피아노",
        rehearsalPriority: "high",
        hitPlan: `Land this hit with ${targetRole}; don't drift past the downbeat.`,
        hitPlanSource: "model"
      },
      {
        ...seed.roles[2]!,
        id: "long-part-a",
        name: `${targetRole}-A`,
        rehearsalPriority: "medium"
      },
      {
        ...seed.roles[2]!,
        id: "long-part-b",
        name: `${targetRole}-B`,
        rehearsalPriority: "low"
      }
    ];
    seed.partGraph = [
      { role_id: "piano", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "long-part-a", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "long-part-b", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    render(<FirstHitPlanCallout song={song} />);

    expect(screen.getByText(/^Land this hit with /)).toBeTruthy();
    expect(screen.queryByText(/파트와 이 히트를 맞추세요. 다운비트 뒤로 밀리지 마세요.$/)).toBeNull();
  });
});
