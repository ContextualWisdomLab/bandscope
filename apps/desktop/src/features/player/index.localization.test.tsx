import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerFeature } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

function songWithPreChorus() {
  const song = createDemoRehearsalSong();
  const seed = song.sections[0]!;
  const preChorus = structuredClone(seed);
  preChorus.id = "pre-chorus-localization";
  preChorus.label = "pre-chorus";
  preChorus.timeRange = { start: 20, end: 28 };
  song.sections = [preChorus];
  return song;
}

describe("PlayerFeature localization", () => {
  it("keeps the Korean player summary and playback notice locale-consistent", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });

    render(<PlayerFeature title="Player" song={songWithPreChorus()} />);

    expect(screen.getByText("1개 섹션")).toBeTruthy();
    expect(screen.queryByText("1 section")).toBeNull();
    expect(screen.getByText("프리코러스")).toBeTruthy();
    expect(screen.queryByText("pre-chorus")).toBeNull();
    expect(
      screen.getByText("오디오 재생은 로컬 오디오 소스가 있는 데스크톱 앱에서 사용할 수 있습니다.")
    ).toBeTruthy();
    expect(
      screen.queryByText("Audio playback requires the desktop app with a local audio source.")
    ).toBeNull();
  });
});
