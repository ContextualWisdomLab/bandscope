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

describe("Workspace selected-part first-pass take", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("hides the first-pass take until a named part is selected", () => {
    setNavigatorLanguage("en-US");
    render(<Workspace song={createDemoRehearsalSong()} />);

    expect(screen.queryByTestId("selected-part-first-pass")).toBeNull();
  });

  it("names the selected bass part's simpler take as the first pass", () => {
    setNavigatorLanguage("en-US");
    render(<Workspace song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const callout = screen.getByTestId("selected-part-first-pass");
    expect(callout).toHaveTextContent("Tonight's first-pass take");
    expect(callout).toHaveTextContent(
      "First pass for Bass Guitar in verse: Stay on roots if the chorus entrance gets muddy. Play that simpler take before adding the rest."
    );
  });

  it("names the selected vocal part's simpler take as the first pass", () => {
    setNavigatorLanguage("en-US");
    render(<Workspace song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));

    expect(screen.getByTestId("selected-part-first-pass")).toHaveTextContent(
      "First pass for Lead Vocal in verse: Keep the sustained note centered; skip the ad-lib on the first pass. Play that simpler take before adding the rest."
    );
  });

  it("keeps Korean copy particle-safe for a Latin role name", () => {
    setNavigatorLanguage("ko-KR");
    render(<Workspace song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const callout = screen.getByTestId("selected-part-first-pass");
    expect(callout).toHaveTextContent("오늘 이 파트의 첫 간소화");
    expect(callout).toHaveTextContent("Bass Guitar 파트");
    expect(callout).not.toHaveTextContent("Bass Guitar으로");
    expect(callout).toHaveTextContent(
      "verse에서 Bass Guitar 파트의 첫 패스: Stay on roots if the chorus entrance gets muddy. 나머지를 더하기 전에 그 간소화된 버전으로 연습하세요."
    );
  });

  it("tells the player to confirm a missing first-pass take instead of hiding the next action", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      simplification: "none"
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    expect(screen.getByTestId("selected-part-first-pass")).toHaveTextContent(
      "This part still needs a trusted first-pass take. Confirm the simpler version before the first run."
    );
  });
});
