import { describe, expect, it } from "vitest";
import {
  FIRST_RUN_WHOLE_BAND_ROLE_FOCUS,
  displaySelectedAudioName,
  isFirstRunRoleId,
  roleFocusForFirstRun
} from "./firstRunRoles";

describe("firstRunRoles", () => {
  it("admits only the closed first-run role choices", () => {
    expect(isFirstRunRoleId("whole-band")).toBe(true);
    expect(isFirstRunRoleId("lead-vocal")).toBe(true);
    expect(isFirstRunRoleId("bass-guitar")).toBe(true);
    expect(isFirstRunRoleId("keys-right")).toBe(true);
    expect(isFirstRunRoleId("drums")).toBe(false);
    expect(isFirstRunRoleId("")).toBe(false);
  });

  it("maps each admitted role onto existing analysis role IDs", () => {
    expect(roleFocusForFirstRun("whole-band")).toEqual([...FIRST_RUN_WHOLE_BAND_ROLE_FOCUS]);
    expect(roleFocusForFirstRun("lead-vocal")).toEqual(["lead-vocal"]);
    expect(roleFocusForFirstRun("bass-guitar")).toEqual(["bass-guitar"]);
    expect(roleFocusForFirstRun("keys-right")).toEqual(["keys-right"]);
  });

  it("never renders local path segments in the selected-song label", () => {
    expect(displaySelectedAudioName("rehearsal-take.wav")).toBe("rehearsal-take.wav");
    expect(displaySelectedAudioName("/Users/test/Music/late-night-set.wav")).toBe("late-night-set.wav");
    expect(displaySelectedAudioName("C:\\Users\\test\\Music\\late-night-set.wav")).toBe("late-night-set.wav");
    expect(displaySelectedAudioName("..")).toBe("");
    expect(displaySelectedAudioName("")).toBe("");
  });
});
