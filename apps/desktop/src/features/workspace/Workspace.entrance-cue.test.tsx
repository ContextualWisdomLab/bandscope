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

describe("Workspace selected-part entrance cue", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("hides the entrance cue until a named part is selected", () => {
    setNavigatorLanguage("en-US");
    render(<Workspace song={createDemoRehearsalSong()} />);

    expect(screen.queryByTestId("selected-part-entrance-cue")).toBeNull();
  });

  it("names the selected bass part's transition as the next entrance", () => {
    setNavigatorLanguage("en-US");
    render(<Workspace song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const callout = screen.getByTestId("selected-part-entrance-cue");
    expect(callout).toHaveTextContent("Tonight's entrance cue");
    expect(callout).toHaveTextContent(
      "Catch this transition in verse before Bass Guitar enters: Hold through the pickup before the downbeat."
    );
  });

  it("names the selected vocal lyric as the next entrance", () => {
    setNavigatorLanguage("en-US");
    render(<Workspace song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lead Vocal" }));

    expect(screen.getByTestId("selected-part-entrance-cue")).toHaveTextContent(
      'Listen for "city lights" in verse, then Lead Vocal enters.'
    );
  });

  it("keeps Korean copy particle-safe for a Latin role name", () => {
    setNavigatorLanguage("ko-KR");
    render(<Workspace song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const callout = screen.getByTestId("selected-part-entrance-cue");
    expect(callout).toHaveTextContent("오늘 이 파트의 첫 입장 큐");
    expect(callout).toHaveTextContent("Bass Guitar 파트");
    expect(callout).not.toHaveTextContent("Bass Guitar으로");
    expect(callout).toHaveTextContent(
      "verse에서 이 전환을 잡고 Bass Guitar 파트로 들어오세요: Hold through the pickup before the downbeat."
    );
  });

  it("tells the player to confirm a missing cue instead of hiding the next action", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      cue: { kind: "transition", value: "none" }
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    expect(screen.getByTestId("selected-part-entrance-cue")).toHaveTextContent(
      "This part still needs a trusted entrance cue. Confirm the lyric, count, or transition before the first entrance."
    );
  });
});
