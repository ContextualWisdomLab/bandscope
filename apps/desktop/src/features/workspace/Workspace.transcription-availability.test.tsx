import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

describe("Workspace transcription availability", () => {
  it("does not advertise bass transcription as actionable without a production transcription path", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      id: "low-end",
      name: "Bass Guitar",
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const transcribeButton = screen.getByRole("button", {
      name: "Transcribe Bass",
    });
    expect(transcribeButton.getAttribute("aria-disabled")).toBe("true");
    expect(transcribeButton.getAttribute("title")).toBe(
      "Bass Guitar transcription is not available yet.",
    );
  });
});
