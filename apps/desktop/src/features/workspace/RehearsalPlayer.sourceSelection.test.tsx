import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn(
    (source: string) => `bandscope-playback://localhost/${source}`,
  ),
  invoke: vi.fn(),
}));

const fullMixAuthority = "bandscope-project://project-100-1";
const stemAuthorities = [
  `${fullMixAuthority}/stem/vocals`,
  `${fullMixAuthority}/stem/bass`,
  `${fullMixAuthority}/stem/drums`,
  `${fullMixAuthority}/stem/other`,
] as const;

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("RehearsalPlayer mounted playback-source selection", () => {
  beforeEach(() => {
    vi.mocked(convertFileSrc).mockClear();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue([
      stemAuthorities[3],
      fullMixAuthority,
      stemAuthorities[1],
      stemAuthorities[0],
      stemAuthorities[2],
    ]);
  });

  it("discovers the current atomic stem set and switches the mounted player only through opaque authority", async () => {
    render(
      <RehearsalPlayer
        song={createDemoRehearsalSong()}
        hasLocalAudio={true}
        audioSourcePath={fullMixAuthority}
      />,
    );

    expect(await screen.findByRole("group", { name: "Playback source" })).toBeInTheDocument();
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "get_playback_source_availability",
      { currentFullMixAuthority: fullMixAuthority },
    );

    const fullMix = screen.getByRole("radio", { name: "Full mix" });
    const vocals = screen.getByRole("radio", { name: "Vocals" });
    expect(fullMix).toBeChecked();
    expect(vocals).not.toBeChecked();

    fireEvent.click(vocals);

    await waitFor(() => expect(vocals).toBeChecked());
    expect(vi.mocked(convertFileSrc)).toHaveBeenCalledWith(
      "project-100-1/stem/vocals",
      "bandscope-playback",
    );
    expect(vi.mocked(convertFileSrc)).not.toHaveBeenCalledWith(
      expect.stringContaining("/private/"),
      expect.anything(),
    );
  });

  it("never renders partial native availability as buyer-selectable stems", async () => {
    vi.mocked(invoke).mockResolvedValue([
      fullMixAuthority,
      stemAuthorities[0],
      stemAuthorities[1],
    ]);

    render(
      <RehearsalPlayer
        song={createDemoRehearsalSong()}
        hasLocalAudio={true}
        audioSourcePath={fullMixAuthority}
      />,
    );

    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("group", { name: "Playback source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Vocals" })).not.toBeInTheDocument();
  });

  it("does not let a late discovery result from the previous project repopulate the selector", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const nextFullMixAuthority = "bandscope-project://project-200-2";
    const nextStems = [
      `${nextFullMixAuthority}/stem/vocals`,
      `${nextFullMixAuthority}/stem/bass`,
      `${nextFullMixAuthority}/stem/drums`,
      `${nextFullMixAuthority}/stem/other`,
    ] as const;
    vi.mocked(invoke)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const song = createDemoRehearsalSong();
    const { rerender } = render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={fullMixAuthority}
      />,
    );

    rerender(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath={nextFullMixAuthority}
      />,
    );
    second.resolve([
      nextStems[2],
      nextFullMixAuthority,
      nextStems[0],
      nextStems[3],
      nextStems[1],
    ]);

    const nextVocals = await screen.findByRole("radio", { name: "Vocals" });
    expect(nextVocals).toHaveValue(nextStems[0]);

    first.resolve([
      fullMixAuthority,
      stemAuthorities[0],
      stemAuthorities[1],
      stemAuthorities[2],
      stemAuthorities[3],
    ]);

    await waitFor(() => expect(screen.getByRole("radio", { name: "Vocals" })).toHaveValue(nextStems[0]));
    expect(screen.queryByDisplayValue(stemAuthorities[0])).not.toBeInTheDocument();
  });
});
