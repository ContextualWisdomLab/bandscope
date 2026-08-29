import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { RehearsalPlayer } from "./RehearsalPlayer";

describe("RehearsalPlayer audio authority", () => {
  it("refuses to start when local-audio metadata has no playable asset URL", () => {
    const song = createDemoRehearsalSong();

    render(
      <RehearsalPlayer
        song={song}
        hasLocalAudio={true}
        audioSourcePath="browser://selected-audio"
        startNonce={1}
      />,
    );

    expect(
      screen.getByRole("button", { name: /start the count-in/i }),
    ).toBeDisabled();
    expect(
      screen.getByTestId("rehearsal-loop-next-action").textContent,
    ).not.toMatch(/count in 4 beats/i);
  });
});
