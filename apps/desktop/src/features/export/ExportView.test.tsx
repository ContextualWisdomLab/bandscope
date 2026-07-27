import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExportView } from "./ExportView";
import { type RehearsalSong } from "@bandscope/shared-types";
import { createTranslator } from "@/i18n";

const mockSong: RehearsalSong = {
  title: "Test Song",
  sections: [],
  roles: [],
};

const t = createTranslator("ko");

describe("ExportView", () => {
  it("renders export view correctly", () => {
    render(<ExportView song={mockSong} t={t} />);

    expect(screen.getByText("내보내기")).toBeInTheDocument();
    expect(screen.getByText(/내보내기 기능이 준비되었습니다./)).toBeInTheDocument();
    expect(screen.getByText("CSV Cue Sheet")).toBeInTheDocument();
    expect(screen.getByText("JSON Chart")).toBeInTheDocument();
  });
});
