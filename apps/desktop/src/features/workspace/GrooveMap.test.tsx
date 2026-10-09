import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GrooveMap } from "./GrooveMap";

describe("note timing map", () => {
  it("orders occupied lanes by MIDI pitch and uses actual recording duration", () => {
    const notes = [
      { pitch: "B3", onset: 1, offset: 2, velocity: 0.8 },
      { pitch: "C4", onset: 0, offset: 1, velocity: 0.8 },
      { pitch: "A3", onset: 2, offset: 3, velocity: 0.8 }
    ];
    render(<GrooveMap notes={notes} durationSeconds={4} locale="en" />);
    const chart = screen.getByRole("region", { name: "Estimated note timing" });
    expect(chart.tabIndex).toBe(0);
    expect(screen.getByText("C4").parentElement!.style.top).toBe("0px");
    expect(screen.getByText("B3").parentElement!.style.top).toBe("32px");
    expect(screen.getByText("A3").parentElement!.style.top).toBe("64px");
    const note = screen.getByTitle("B3 (1.00–2.00 s)");
    expect(note.style.left).toBe("25%");
    expect(note.style.width).toBe("25%");
    expect(note.className).not.toMatch(/gradient|shadow/);
    expect(screen.getByText("4.0 s")).toBeInTheDocument();
  });

  it("exposes exact note timings through an accessible expandable table", async () => {
    render(<GrooveMap notes={[{ pitch: "E2", onset: 0.25, offset: 0.75, velocity: 0.8 }]} locale="en" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Read note pitches and times"));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Pitch" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "E2" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "0.25" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "0.75" })).toBeInTheDocument();
  });

  it("localizes empty/loading states without a fake percentage or inert cancel button", () => {
    const view = render(<GrooveMap locale="ko" />);
    expect(screen.getByText("이 파트에 표시할 음표 추정값이 없습니다.")).toBeInTheDocument();
    view.rerender(<GrooveMap locale="ko" isLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("음표의 타이밍을 추정하고 있습니다");
    expect(screen.queryByText(/45%|bass/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
