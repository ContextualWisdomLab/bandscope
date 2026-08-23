import { fireEvent, render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it, vi } from "vitest";
import { PlayerFeature } from "./index";

function songWithIntro() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const intro = structuredClone(verse);
  intro.id = "intro-1";
  intro.label = "intro";
  intro.timeRange = { start: 0, end: 8 };
  intro.roles = [
    {
      ...verse.roles[0]!,
      id: "drums",
      name: "Drums",
      rehearsalPriority: "high"
    }
  ];
  intro.partGraph = [
    {
      role_id: "drums",
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [intro, verse];
  return song;
}

describe("PlayerFeature", () => {
  it("asks the room to analyze first when no song is loaded", () => {
    render(<PlayerFeature title="Player" />);
    expect(
      screen.getByText("Analyze tonight's song first, then hear the first intro from this player.")
    ).toBeTruthy();
  });

  it("keeps the intro hear action unavailable without a player playback callback", () => {
    render(<PlayerFeature title="Player" song={songWithIntro()} />);

    expect(screen.queryByRole("button", { name: "Hear Drums start at 0:00" })).toBeNull();
    expect(screen.getByText("Drums starts the intro at 0:00.")).toBeTruthy();
  });

  it("delegates the intro hear action to the owning player callback", () => {
    const onPlayFromSeconds = vi.fn();
    render(<PlayerFeature title="Player" song={songWithIntro()} onPlayFromSeconds={onPlayFromSeconds} />);

    fireEvent.click(screen.getByRole("button", { name: "Hear Drums start at 0:00" }));

    expect(onPlayFromSeconds).toHaveBeenCalledTimes(1);
    expect(onPlayFromSeconds).toHaveBeenCalledWith(0);
  });

  it("localizes the section count, labels, and playback hint instead of mixing English player copy", () => {
    vi.stubGlobal("navigator", { language: "ko-KR" });
    try {
      render(<PlayerFeature title="Player" song={songWithIntro()} />);
      expect(screen.getByText("2개 섹션")).toBeTruthy();
      expect(screen.queryByText("2 sections")).toBeNull();
      expect(screen.getByText("인트로")).toBeTruthy();
      expect(screen.queryByText("intro")).toBeNull();
      expect(screen.getByText("오디오 재생은 로컬 오디오 소스가 있는 데스크톱 앱에서 사용할 수 있습니다.")).toBeTruthy();
      expect(screen.queryByText("Audio playback requires the desktop app with a local audio source.")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders a safe empty summary when the runtime section collection is not an array", () => {
    const song = songWithIntro();
    (song as unknown as { sections: unknown }).sections = null;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("No intro yet. Stay on tonight's map until the start is labeled.")).toBeTruthy();
    expect(screen.getByText("0 sections")).toBeTruthy();
  });

  it("renders a safe empty summary when the runtime section collection is sparse", () => {
    const song = songWithIntro();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("No intro yet. Stay on tonight's map until the start is labeled.")).toBeTruthy();
    expect(screen.getByText("0 sections")).toBeTruthy();
  });

  it("renders a safe empty summary when sections is a throwing own accessor", () => {
    const song = songWithIntro();
    Object.defineProperty(song, "sections", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("sections getter must stay data");
      }
    });

    expect(() => render(<PlayerFeature title="Player" song={song} />)).not.toThrow();
    expect(screen.getByText("No intro yet. Stay on tonight's map until the start is labeled.")).toBeTruthy();
    expect(screen.getByText("0 sections")).toBeTruthy();
  });

  it("renders a safe empty summary when a song Proxy throws on sections access", () => {
    const song = songWithIntro();
    const proxiedSong = new Proxy(song, {
      get(target, key, receiver) {
        if (key === "sections") {
          throw new Error("sections get trap");
        }
        return Reflect.get(target, key, receiver);
      }
    });

    expect(() => render(<PlayerFeature title="Player" song={proxiedSong} />)).not.toThrow();
    expect(screen.getByText("No intro yet. Stay on tonight's map until the start is labeled.")).toBeTruthy();
    expect(screen.getByText("0 sections")).toBeTruthy();
  });

  it("omits malformed runtime section elements without crashing the player summary", () => {
    const song = songWithIntro();
    song.sections = [null, song.sections[1]!] as unknown as typeof song.sections;

    render(<PlayerFeature title="Player" song={song} />);

    expect(screen.getByText("1 section")).toBeTruthy();
    expect(screen.getByText("verse")).toBeTruthy();
  });

  it("does not pass an object-valued runtime song title into React copy", () => {
    const song = songWithIntro();
    (song as unknown as { title: unknown }).title = { unsafe: "not-copy" };

    expect(() => render(<PlayerFeature title="Player" song={song} />)).not.toThrow();
    expect(screen.queryByText("not-copy")).toBeNull();
  });
});