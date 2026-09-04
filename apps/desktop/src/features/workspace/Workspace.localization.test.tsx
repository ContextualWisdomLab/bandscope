import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("Workspace timeline localization", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("keeps the Korean workspace timeline summary in Korean", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();

    render(<Workspace song={song} />);

    expect(
      screen.getByText(`${song.sections.length}개 섹션 · 그루브 · 역할 · 코드 · 신뢰도`)
    ).toBeTruthy();
    expect(screen.queryByText(/mapped with groove, role cues, and chord confidence notes/i)).toBeNull();
  });
});
