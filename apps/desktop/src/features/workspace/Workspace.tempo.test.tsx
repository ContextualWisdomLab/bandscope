import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

function songWithTempo(tempo: number) {
  const song = createDemoRehearsalSong();
  song.tempo = tempo;
  return song;
}

describe("Workspace tempo readiness", () => {
  it.each([90.5, 500])("does not present an uncountable %s BPM as a ready tempo", (tempo) => {
    render(<Workspace song={songWithTempo(tempo)} />);

    expect(screen.queryByText(`${tempo} BPM`, { exact: false })).toBeNull();
  });

  it("keeps the badge for a countable integer tempo", () => {
    render(<Workspace song={songWithTempo(120)} />);

    expect(screen.getByText("120 BPM", { exact: false })).toBeTruthy();
  });
});
