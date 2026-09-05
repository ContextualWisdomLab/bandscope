import { describe, expect, it } from "vitest";
import {
  beginPlaybackSourceDiscovery,
  completePlaybackSourceDiscovery,
  createPlaybackSourceSession,
  selectPlaybackSource,
} from "./playbackSourceSession";

const projectA = "bandscope-project://project-100-1";
const projectAOptions = [
  { kind: "full_mix" as const, authority: projectA },
  { kind: "vocals" as const, authority: `${projectA}/stem/vocals` },
  { kind: "bass" as const, authority: `${projectA}/stem/bass` },
  { kind: "drums" as const, authority: `${projectA}/stem/drums` },
  { kind: "other" as const, authority: `${projectA}/stem/other` },
];

describe("playback source session receipt integrity", () => {
  it("keeps authority-bearing session snapshots immutable across discovery and selection", () => {
    const initial = createPlaybackSourceSession(projectA);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.options)).toBe(true);
    expect(Object.isFrozen(initial.options[0])).toBe(true);

    const refresh = beginPlaybackSourceDiscovery(initial, projectA);
    expect(Object.isFrozen(refresh.state)).toBe(true);
    expect(Object.isFrozen(refresh.state.options)).toBe(true);
    expect(Object.isFrozen(refresh.request)).toBe(true);

    const completed = completePlaybackSourceDiscovery(
      refresh.state,
      refresh.request,
      projectAOptions,
    );
    expect(Object.isFrozen(completed)).toBe(true);
    expect(Object.isFrozen(completed.options)).toBe(true);
    expect(completed.options.every(Object.isFrozen)).toBe(true);
    expect(Reflect.set(completed.options[1], "authority", `${projectA}/stem/guitar`)).toBe(
      false,
    );
    expect(completed.options[1]?.authority).toBe(`${projectA}/stem/vocals`);

    const selected = selectPlaybackSource(completed, `${projectA}/stem/drums`);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected.options)).toBe(true);
    expect(selected.selectedAuthority).toBe(`${projectA}/stem/drums`);
    expect(Reflect.set(selected, "selectedAuthority", `${projectA}/stem/guitar`)).toBe(
      false,
    );
    expect(selected.selectedAuthority).toBe(`${projectA}/stem/drums`);
  });
});
