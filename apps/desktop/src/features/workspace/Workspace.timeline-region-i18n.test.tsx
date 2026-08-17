import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

const originalLanguageDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "language");

afterEach(() => {
  if (originalLanguageDescriptor) {
    Object.defineProperty(window.navigator, "language", originalLanguageDescriptor);
  } else {
    Reflect.deleteProperty(window.navigator, "language");
  }
});

function useKoreanLocale(): void {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: "ko-KR"
  });
}

describe("Workspace timeline region localization", () => {
  it("uses localized accessible copy for the scrollable song-structure timeline", () => {
    useKoreanLocale();

    render(<Workspace song={createDemoRehearsalSong()} />);

    expect(screen.getByRole("region", { name: "스크롤 가능한 곡 구조 타임라인" })).toBeTruthy();
  });
});
