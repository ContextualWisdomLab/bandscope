import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { afterEach, describe, expect, it } from "vitest";
import { SectionRoadmap } from "./SectionRoadmap";
import { Workspace } from "./Workspace";

const originalLanguage = navigator.language;

function setNavigatorLanguage(language: string): void {
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language
  });
}

describe("canonical first-change rehearsal guidance", () => {
  afterEach(() => {
    setNavigatorLanguage(originalLanguage);
  });

  it("keeps groove, duration, and confidence in one buyer-visible change surface", () => {
    setNavigatorLanguage("en-US");
    render(<Workspace song={createDemoRehearsalSong()} />);

    const changeSurface = screen.getByRole("region", { name: "Tonight's first changes" });
    expect(changeSurface).toContainElement(screen.getByTestId("first-groove-change"));
    expect(changeSurface).toContainElement(screen.getByTestId("first-duration-change"));
    expect(changeSurface).toContainElement(screen.getByTestId("first-confidence-change"));
    expect(screen.getByTestId("first-duration-change")).toHaveTextContent(
      "Tonight's section length stays 20 seconds through the form. Count that length in before the verse."
    );
    expect(screen.getByTestId("first-confidence-change")).toHaveTextContent(
      "Tonight's confidence stays medium through the form. Confirm the verse by ear before you count in."
    );
  });

  it("names the first duration and confidence changes without replacing the groove decision", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      verse,
      {
        ...verse,
        id: "chorus-1",
        label: "chorus",
        groove: "Half-time snare with open hats",
        timeRange: { start: 30, end: 62 },
        confidence: { ...verse.confidence, level: "low" },
        roles: verse.roles.map((role) => ({ ...role, id: `${role.id}-chorus` }))
      }
    ];

    render(<Workspace song={song} />);

    expect(screen.getByTestId("first-groove-change")).toHaveTextContent(
      "The feel changes at chorus: Half-time snare with open hats"
    );
    expect(screen.getByTestId("first-duration-change")).toHaveTextContent(
      "The section length changes at chorus: 32 seconds, after verse's 20 seconds. Count the new length in before the chorus."
    );
    expect(screen.getByTestId("first-confidence-change")).toHaveTextContent(
      "Confidence changes at chorus: low, after verse's medium. Confirm the chorus by ear before you count in."
    );
  });

  it("fails closed with explicit ear-check copy when named duration and confidence evidence are unusable", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0] = {
      ...song.sections[0]!,
      label: " ",
      timeRange: { start: 10, end: 10 },
      confidence: { ...song.sections[0]!.confidence, level: "ready" as "low" }
    };

    render(<Workspace song={song} />);

    expect(screen.getByTestId("first-duration-change")).toHaveTextContent(
      "Tonight's first length change still needs an ear check. Confirm how long the first two sections last before you count in."
    );
    expect(screen.getByTestId("first-confidence-change")).toHaveTextContent(
      "Tonight's first confidence change still needs an ear check. Confirm how sure the first two sections are before you count in."
    );
  });

  it("keeps the consolidated change surface and child labels equivalent in Korean", () => {
    setNavigatorLanguage("ko-KR");
    render(<Workspace song={createDemoRehearsalSong()} />);

    expect(screen.getByRole("region", { name: "오늘 먼저 확인할 변화" })).toBeTruthy();
    expect(screen.getByText("오늘 먼저 바뀌는 그루브")).toBeTruthy();
    expect(screen.getByText("오늘 먼저 바뀌는 구간 길이")).toBeTruthy();
    expect(screen.getByText("오늘 먼저 바뀌는 확신")).toBeTruthy();
  });

  it("puts duration and confidence next actions only on the stable destination section", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      {
        ...verse,
        id: "verse-a",
        label: "verse",
        timeRange: { start: 0, end: 16 },
        confidence: { ...verse.confidence, level: "medium" }
      },
      {
        ...verse,
        id: "verse-b",
        label: "verse",
        timeRange: { start: 16, end: 48 },
        confidence: { ...verse.confidence, level: "low" }
      }
    ];

    render(<SectionRoadmap song={song} activeRole={null} />);

    expect(screen.queryByTestId("duration-next-action-verse-a")).toBeNull();
    expect(screen.getByTestId("duration-next-action-verse-b")).toHaveTextContent(
      "Count this new length in before verse."
    );
    expect(screen.queryByTestId("confidence-next-action-verse-a")).toBeNull();
    expect(screen.getByTestId("confidence-next-action-verse-b")).toHaveTextContent(
      "Confirm this section by ear before verse."
    );
  });

  it("keeps hold actions on the first stable section for duration and confidence", () => {
    setNavigatorLanguage("ko-KR");
    render(<SectionRoadmap song={createDemoRehearsalSong()} activeRole={null} />);

    expect(screen.getByTestId("duration-next-action-verse-1")).toHaveTextContent(
      "verse 들어가기 전에 이 길이를 세어 보세요."
    );
    expect(screen.getByTestId("confidence-next-action-verse-1")).toHaveTextContent(
      "verse 들어가기 전에 이 중간 읽기를 귀로 확인해 보세요."
    );
  });
});
