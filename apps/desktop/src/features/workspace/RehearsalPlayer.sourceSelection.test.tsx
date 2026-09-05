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
});
