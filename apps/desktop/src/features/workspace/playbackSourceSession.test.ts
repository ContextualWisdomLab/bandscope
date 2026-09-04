import { describe, expect, it } from "vitest";
import {
  beginPlaybackSourceDiscovery,
  completePlaybackSourceDiscovery,
  createPlaybackSourceSession,
  selectPlaybackSource,
} from "./playbackSourceSession";

const projectA = "bandscope-project://project-100-1";
const projectB = "bandscope-project://project-200-1";
const projectAOptions = [
  { kind: "full_mix" as const, authority: projectA },
  { kind: "vocals" as const, authority: `${projectA}/stem/vocals` },
  { kind: "bass" as const, authority: `${projectA}/stem/bass` },
  { kind: "drums" as const, authority: `${projectA}/stem/drums` },
  { kind: "other" as const, authority: `${projectA}/stem/other` },
];

describe("playback source discovery session", () => {
  it("starts from the current full mix without inventing stem availability", () => {
    expect(createPlaybackSourceSession(projectA)).toEqual({
      fullMixAuthority: projectA,
      options: [{ kind: "full_mix", authority: projectA }],
      pendingRequest: null,
      requestSequence: 0,
      selectedAuthority: projectA,
    });
  });

  it("clears stale stems before a refresh can observe native revocation", () => {
    let state = createPlaybackSourceSession(projectA);
    const refresh = beginPlaybackSourceDiscovery(state, projectA);
    state = completePlaybackSourceDiscovery(refresh.state, refresh.request, projectAOptions);
    state = selectPlaybackSource(state, `${projectA}/stem/vocals`);

    const nextRefresh = beginPlaybackSourceDiscovery(state, projectA);

    expect(nextRefresh.state.options).toEqual([
      { kind: "full_mix", authority: projectA },
    ]);
    expect(nextRefresh.state.selectedAuthority).toBe(projectA);
  });

  it("ignores an older discovery after the full-mix authority rotates", () => {
    const first = beginPlaybackSourceDiscovery(
      createPlaybackSourceSession(projectA),
      projectA,
    );
    const rotated = beginPlaybackSourceDiscovery(first.state, projectB);

    const staleCompletion = completePlaybackSourceDiscovery(
      rotated.state,
      first.request,
      projectAOptions,
    );

    expect(staleCompletion.fullMixAuthority).toBe(projectB);
    expect(staleCompletion.options).toEqual([
      { kind: "full_mix", authority: projectB },
    ]);
    expect(staleCompletion.pendingRequest).toEqual(rotated.request);
  });

  it("fails closed when completion is partial, malformed, or project-mismatched", () => {
    const begin = beginPlaybackSourceDiscovery(
      createPlaybackSourceSession(projectA),
      projectA,
    );

    for (const invalid of [
      projectAOptions.slice(0, 2),
      [...projectAOptions, projectAOptions[1]],
      [{ kind: "full_mix", authority: projectB }],
      [{ kind: "vocals", authority: `${projectA}/stem/vocals/../private.wav` }],
      null,
      "not-an-option-list",
    ]) {
      const completed = completePlaybackSourceDiscovery(
        begin.state,
        begin.request,
        invalid,
      );
      expect(completed.options).toEqual([
        { kind: "full_mix", authority: projectA },
      ]);
      expect(completed.selectedAuthority).toBe(projectA);
      expect(completed.pendingRequest).toBeNull();
    }
  });

  it("fails closed when hostile option inspection throws", () => {
    const begin = beginPlaybackSourceDiscovery(
      createPlaybackSourceSession(projectA),
      projectA,
    );
    const throwingGetter = Object.defineProperties({}, {
      authority: { enumerable: true, value: projectA },
      kind: {
        enumerable: true,
        get: () => {
          throw new Error("hostile kind getter");
        },
      },
    });
    const throwingProxy = new Proxy({}, {
      getOwnPropertyDescriptor: () => {
        throw new Error("hostile property trap");
      },
    });

    for (const invalid of [[throwingGetter], [throwingProxy]]) {
      expect(() =>
        completePlaybackSourceDiscovery(begin.state, begin.request, invalid),
      ).not.toThrow();
      const completed = completePlaybackSourceDiscovery(
        begin.state,
        begin.request,
        invalid,
      );
      expect(completed.options).toEqual([
        { kind: "full_mix", authority: projectA },
      ]);
      expect(completed.selectedAuthority).toBe(projectA);
      expect(completed.pendingRequest).toBeNull();
    }
  });

  it("admits selection only from the latest canonical option set", () => {
    const begin = beginPlaybackSourceDiscovery(
      createPlaybackSourceSession(projectA),
      projectA,
    );
    const completed = completePlaybackSourceDiscovery(
      begin.state,
      begin.request,
      projectAOptions,
    );

    expect(
      selectPlaybackSource(completed, `${projectA}/stem/drums`).selectedAuthority,
    ).toBe(`${projectA}/stem/drums`);
    expect(
      selectPlaybackSource(completed, `${projectA}/stem/guitar`).selectedAuthority,
    ).toBe(projectA);
  });
});
