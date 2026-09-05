import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn(
    (source: string) => `bandscope-playback://localhost/${source}`,
  ),
  invoke: vi.fn(),
}));

const fullMixAuthority = "bandscope-project://project-i18n-1";
const stemAuthorities = [
  `${fullMixAuthority}/stem/vocals`,
  `${fullMixAuthority}/stem/bass`,
  `${fullMixAuthority}/stem/drums`,
  `${fullMixAuthority}/stem/other`,
] as const;

describe("RehearsalPlayer playback-source locale copy", () => {
  beforeEach(() => {
    vi.mocked(convertFileSrc).mockClear();
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "en-US",
    });
  });

  it("renders Korean playback-source copy while preserving opaque authority values", async () => {
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "ko-KR",
    });
    const playbackSourceInvoke = vi.fn(async () => [
      fullMixAuthority,
      ...stemAuthorities,
    ]);

    render(
      <RehearsalPlayer
        song={createDemoRehearsalSong()}
        hasLocalAudio={true}
        audioSourcePath={fullMixAuthority}
        playbackSourceInvoke={playbackSourceInvoke}
      />,
    );

    expect(await screen.findByRole("group", { name: "재생 소스" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "전체 믹스" })).toHaveValue(fullMixAuthority);
    expect(screen.getByRole("radio", { name: "보컬" })).toHaveValue(stemAuthorities[0]);
    expect(screen.getByRole("radio", { name: "베이스" })).toHaveValue(stemAuthorities[1]);
    expect(screen.getByRole("radio", { name: "드럼" })).toHaveValue(stemAuthorities[2]);
    expect(screen.getByRole("radio", { name: "그 외 악기" })).toHaveValue(stemAuthorities[3]);
  });
});
