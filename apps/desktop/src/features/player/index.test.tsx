import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { PlayerFeature } from "./index";

function songWithOutro() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const outro = structuredClone(verse);
  outro.id = "outro-1";
  outro.label = "outro";
  outro.timeRange = { start: 180, end: 196 };
  outro.roles = [
    {
      ...verse.roles[0]!,
      id: "drums",
      name: "Drums",
      rehearsalPriority: "high"
    }
  ];
  outro.partGraph = [
    {
      role_id: "drums",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, outro];
  return song;
}

describe("PlayerFeature", () => {
  it("asks the room to analyze first when no song is loaded", () => {
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText("Analyze tonight's song first, then hear the first outro from this player.")
    ).toBeTruthy();
  });

  it("keeps the outro hear action unavailable without a player playback callback", () => {
    render(<PlayerFeature title="Player" song={songWithOutro()} />);

    expect(screen.queryByRole("button", { name: "Hear Drums land at 3:00" })).toBeNull();
    expect(screen.getByText("Drums holds the outro at 3:00.")).toBeTruthy();
  });

  it("delegates the outro hear action to the owning player callback", () => {
    const onPlayFromSeconds = vi.fn();
    render(<PlayerFeature title="Player" song={songWithOutro()} onPlayFromSeconds={onPlayFromSeconds} />);

    fireEvent.click(screen.getByRole("button", { name: "Hear Drums land at 3:00" }));

    expect(onPlayFromSeconds).toHaveBeenCalledTimes(1);
    expect(onPlayFromSeconds).toHaveBeenCalledWith(180);
  });

  it("localizes the section count, labels, and playback guidance instead of mixing English player copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    try {
      render(<PlayerFeature title="Player" song={songWithOutro()} />);
      expect(screen.getByText("2개 구간")).toBeTruthy();
      expect(screen.queryByText("2 sections")).toBeNull();
      expect(screen.getByText("아웃트로")).toBeTruthy();
      expect(screen.queryByText("outro")).toBeNull();
      expect(
        screen.getByText("오디오 재생은 로컬 오디오 소스가 있는 데스크톱 앱에서 사용할 수 있습니다.")
      ).toBeTruthy();
      expect(
        screen.queryByText("Audio playback requires the desktop app with a local audio source.")
      ).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders a safe empty summary when the runtime section collection is not an array", () => {
    const song = songWithOutro();
    (song as unknown as { sections: unknown }).sections = null;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("No outro yet. Stay on tonight's map until the ending is labeled.")).toBeTruthy();
    expect(screen.getByText("0 sections")).toBeTruthy();
  });

  it("renders a safe empty summary when the runtime section collection is sparse", () => {
    const song = songWithOutro();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("No outro yet. Stay on tonight's map until the ending is labeled.")).toBeTruthy();
    expect(screen.getByText("0 sections")).toBeTruthy();
  });

  it("omits malformed runtime section elements without crashing the player summary", () => {
    const song = songWithOutro();
    song.sections = [null, song.sections[0]!] as unknown as typeof song.sections;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("1 section")).toBeTruthy();
    expect(screen.getByText("verse")).toBeTruthy();
  });

  it("does not pass an object-valued runtime song title into React copy", () => {
    const song = songWithOutro();
    (song as unknown as { title: unknown }).title = { unsafe: "not-copy" };

    expect(() => render(<PlayerFeature title="Player" song={song} />)).not.toThrow();
    expect(screen.queryByText("not-copy")).toBeNull();
  });
});
