import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstHitPlanCallout } from "./FirstHitPlanCallout";

describe("FirstHitPlanCallout role-name snapshot authority", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not re-authorize generated localization from a later descriptor value", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const role = section.roles[1]!;
    const rawPlan = "Land this hit with Injected target; don't drift past the downbeat.";

    for (const candidate of section.roles) {
      candidate.hitPlan = "";
    }
    role.hitPlan = rawPlan;
    role.hitPlanSource = "model";

    let nameDescriptorReads = 0;
    section.roles[1] = new Proxy(role, {
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        if (property === "name" && descriptor) {
          nameDescriptorReads += 1;
          return {
            ...descriptor,
            value: nameDescriptorReads === 1 ? descriptor.value : "Injected target"
          };
        }
        return descriptor;
      }
    });

    render(<FirstHitPlanCallout song={song} />);

    expect(screen.getByText(rawPlan)).toBeTruthy();
    expect(
      screen.queryByText("Injected target 파트와 이 히트를 맞추세요. 다운비트 뒤로 밀리지 마세요.")
    ).toBeNull();
  });
});
