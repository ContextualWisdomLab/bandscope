import { fireEvent, render, screen } from "@testing-library/react";
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

describe("Workspace selected-part confirmed chord", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("stays hidden until a part with a room-confirmed chord is selected", () => {
    setNavigatorLanguage("en-US");
    render(<Workspace song={createDemoRehearsalSong()} />);

    expect(screen.queryByTestId("selected-part-confirmed-chord")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));
    expect(screen.queryByTestId("selected-part-confirmed-chord")).toBeNull();
  });

  it("names the selected part's confirmed chord and the next lock-in action", () => {
    setNavigatorLanguage("en-US");
    render(<Workspace song={createDemoRehearsalSong()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));

    const callout = screen.getByTestId("selected-part-confirmed-chord");
    expect(callout).toHaveTextContent("Tonight's confirmed chord");
    expect(callout).toHaveTextContent(
      "Lead Vocal uses the room's C#m11 in verse. Lock that chord before the verse."
    );
  });

  it("keeps Korean copy particle-safe for arbitrary chord symbols", () => {
    setNavigatorLanguage("ko-KR");
    render(<Workspace song={createDemoRehearsalSong()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));

    expect(screen.getByTestId("selected-part-confirmed-chord")).toHaveTextContent(
      "verse의 Lead Vocal 파트는 방이 확인한 C#m11 코드로 맞춥니다. verse 전에 그 코드를 고정하세요."
    );
  });
});
