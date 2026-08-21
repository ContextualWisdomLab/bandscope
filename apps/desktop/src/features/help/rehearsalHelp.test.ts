import { describe, expect, it } from "vitest";
import {
  rehearsalHelpAction,
  resolveRehearsalHelpPhase,
  type RehearsalHelpSnapshot,
} from "./rehearsalHelp";

function snapshot(
  overrides: Partial<RehearsalHelpSnapshot> = {},
): RehearsalHelpSnapshot {
  return {
    hasLocalSource: false,
    analysisInFlight: false,
    hasSong: false,
    hasError: false,
    ...overrides,
  };
}

describe("rehearsalHelp", () => {
  it("asks for a local song before any source is chosen", () => {
    expect(resolveRehearsalHelpPhase(snapshot())).toBe("choose-local-song");
    expect(rehearsalHelpAction("choose-local-song")).toBe("choose-local");
  });

  it("starts analysis once a local song is loaded", () => {
    expect(
      resolveRehearsalHelpPhase(snapshot({ hasLocalSource: true })),
    ).toBe("start-analysis");
    expect(rehearsalHelpAction("start-analysis")).toBe("start-analysis");
  });

  it("waits while analysis is in flight even if an earlier error remains", () => {
    expect(
      resolveRehearsalHelpPhase(
        snapshot({
          hasLocalSource: true,
          analysisInFlight: true,
          hasError: true,
        }),
      ),
    ).toBe("wait-for-analysis");
    expect(rehearsalHelpAction("wait-for-analysis")).toBe("none");
  });

  it("retries after a failed analysis when no song is ready", () => {
    expect(
      resolveRehearsalHelpPhase(
        snapshot({ hasLocalSource: true, hasError: true }),
      ),
    ).toBe("retry-after-failure");
    expect(rehearsalHelpAction("retry-after-failure")).toBe("choose-local");
  });

  it("opens the rehearsal map once a song is ready", () => {
    expect(
      resolveRehearsalHelpPhase(
        snapshot({ hasLocalSource: true, hasSong: true }),
      ),
    ).toBe("open-rehearsal-map");
    expect(rehearsalHelpAction("open-rehearsal-map")).toBe("focus-map");
  });

  it("keeps a ready song ahead of a stale error flag", () => {
    expect(
      resolveRehearsalHelpPhase(
        snapshot({ hasLocalSource: true, hasSong: true, hasError: true }),
      ),
    ).toBe("open-rehearsal-map");
  });
});
