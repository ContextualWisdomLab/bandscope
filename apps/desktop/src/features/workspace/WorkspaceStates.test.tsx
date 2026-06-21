import { render, screen } from "@testing-library/react";
import { describe, expect, it, afterEach } from "vitest";
import { EmptyState } from "./WorkspaceStates";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("EmptyState", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("renders the empty state title and description in English by default", () => {
    setNavigatorLanguage("en-US");
    render(<EmptyState />);

    expect(screen.getByRole("heading", { name: "Ready to Analyze" })).toBeTruthy();
    expect(screen.getByText("Choose an audio file to prepare for your rehearsal.")).toBeTruthy();
  });

  it("renders the empty state title and description in Korean when language is ko-KR", () => {
    setNavigatorLanguage("ko-KR");
    render(<EmptyState />);

    expect(screen.getByRole("heading", { name: "분석 준비 완료" })).toBeTruthy();
    expect(screen.getByText("합주할 곡의 오디오 파일을 선택해주세요.")).toBeTruthy();
  });
});
