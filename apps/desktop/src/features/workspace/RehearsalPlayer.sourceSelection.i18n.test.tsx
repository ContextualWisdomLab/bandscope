import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn(
    (source: string) => `bandscope-playback://localhost/${source}`,
  ),
  invoke: vi.fn(),
}));

const fullMixAuthority = "bandscope-project://project-400-4";
const stemAuthorities = [
  `${fullMixAuthority}/stem/vocals`,
  `${fullMixAuthority}/stem/bass`,
  `${fullMixAuthority}/stem/drums`,
  `${fullMixAuthority}/stem/other`,
] as const;
const originalNavigatorLanguageDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "language",
);

describe("RehearsalPlayer playback-source locale copy", () => {
  beforeEach(() => {
    vi.mocked(convertFileSrc).mockClear();
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "en-US",
    });
  });

  afterEach(() => {
    if (originalNavigatorLanguageDescriptor === undefined) {
      delete (navigator as { language?: string }).language;
      return;
    }
    Object.defineProperty(
      navigator,
      "language",
      originalNavigatorLanguageDescriptor,
    );
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

  it("renders the Korean full-mix-only explanation", async () => {
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "ko-KR",
    });
    const playbackSourceInvoke = vi.fn(async () => [fullMixAuthority]);

    render(
      <RehearsalPlayer
        song={createDemoRehearsalSong()}
        hasLocalAudio={true}
        audioSourcePath={fullMixAuthority}
        playbackSourceInvoke={playbackSourceInvoke}
      />,
    );

    expect(
      await screen.findByText(
        "이 프로젝트에는 재생할 수 있는 스템이 없습니다. 전체 믹스는 바로 재생할 수 있습니다.",
        { selector: '[role="status"]' },
      ),
    ).toHaveAttribute("aria-atomic", "true");
  });

  it("renders the Korean retry action after discovery failure", async () => {
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "ko-KR",
    });
    const playbackSourceInvoke = vi
      .fn()
      .mockRejectedValueOnce(new Error("native failure"))
      .mockResolvedValueOnce([fullMixAuthority, ...stemAuthorities]);

    render(
      <RehearsalPlayer
        song={createDemoRehearsalSong()}
        hasLocalAudio={true}
        audioSourcePath={fullMixAuthority}
        playbackSourceInvoke={playbackSourceInvoke}
      />,
    );

    expect(
      await screen.findByText(
        "스템 소스를 확인하지 못했습니다. 전체 믹스는 계속 재생할 수 있습니다.",
        { selector: '[role="status"]' },
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "스템 소스 다시 확인" }));

    expect(await screen.findByRole("group", { name: "재생 소스" })).toBeInTheDocument();
    expect(playbackSourceInvoke).toHaveBeenCalledTimes(2);
  });
});
