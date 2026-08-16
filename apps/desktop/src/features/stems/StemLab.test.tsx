import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { StemLab, stemRoleTypeLabel } from "./StemLab";
import { createTranslator } from "../../i18n";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string) {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("stemRoleTypeLabel", () => {
  it("covers every role class", () => {
    const t = createTranslator("en");
    expect(stemRoleTypeLabel("instrument", t)).toBe("Instrument");
    expect(stemRoleTypeLabel("vocal", t)).toBe("Vocal");
    expect(stemRoleTypeLabel("hand", t)).toBe("Hand part");
  });
});

describe("StemLab", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
    vi.restoreAllMocks();
  });

  it("tells the player to analyze local audio when no song is loaded", () => {
    setNavigatorLanguage("en-US");
    render(<StemLab song={null} />);

    expect(screen.getByRole("heading", { name: /Stem Lab/i })).toBeTruthy();
    expect(
      screen.getByText(/Choose a local audio file and start analysis/i)
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /play stem/i })).toBeNull();
  });

  it("lists isolation lanes from a real demo analysis without fake play controls", () => {
    setNavigatorLanguage("en-US");
    render(<StemLab song={createDemoRehearsalSong()} />);

    expect(screen.getByRole("list", { name: /Parts to isolate/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Bass Guitar" })).toBeTruthy();
    expect(screen.getByText(/C#2–E3/)).toBeTruthy();
    expect(screen.getAllByText(/Lock this range in the matching sections/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /play stem/i })).toBeNull();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it("uses Korean next-action copy for Korean locales", () => {
    setNavigatorLanguage("ko-KR");
    render(<StemLab song={null} />);

    expect(screen.getByRole("heading", { name: "스템 랩" })).toBeTruthy();
    expect(screen.getByText(/로컬 오디오를 고르고 분석을 시작하세요/)).toBeTruthy();
  });

  it("keeps the board inert when a lane is inspected", () => {
    setNavigatorLanguage("en-US");
    render(<StemLab song={createDemoRehearsalSong()} />);
    fireEvent.click(screen.getByRole("heading", { name: "Bass Guitar" }));
    expect(screen.getByRole("heading", { name: "Bass Guitar" })).toBeTruthy();
  });
});
