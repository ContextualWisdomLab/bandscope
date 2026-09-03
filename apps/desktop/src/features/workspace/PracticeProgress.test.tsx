import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PracticeProgress } from "./PracticeProgress";

// Mock the i18n functions
vi.mock("../../i18n", () => ({
  createTranslator: () => (key: string) => key,
  detectPreferredLocale: () => "en-US",
}));

describe("PracticeProgress", () => {
  it("renders with default progress 0 when no progress is provided", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress onChange={handleChange} />);

    expect(screen.getByText("0%")).toBeTruthy();
    const decreaseBtn = screen.getByRole("button", { name: "decreasePracticeProgressAtMin" }) as HTMLButtonElement;
    expect(decreaseBtn).toHaveAttribute("aria-disabled", "true");
    expect(decreaseBtn).toHaveAttribute("title", "decreasePracticeProgressAtMin");

    const clickEvent = createEvent.click(decreaseBtn);
    fireEvent(decreaseBtn, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it("renders provided progress", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("renders the next-action copy when a practice step is named", () => {
    const handleChange = vi.fn();
    render(
      <PracticeProgress
        progress={0}
        onChange={handleChange}
        nextActionCopy="Check Bass Guitar's first range, then mark this part started."
      />
    );

    expect(screen.getByTestId("practice-progress-next-action")).toHaveTextContent(
      "Check Bass Guitar's first range, then mark this part started."
    );
  });

  it("calls onChange with increased value when increase button is clicked", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    const increaseBtn = screen.getByRole("button", { name: "increasePracticeProgressLabel" });
    fireEvent.click(increaseBtn);

    expect(handleChange).toHaveBeenCalledWith(60);
  });

  it("calls onChange with decreased value when decrease button is clicked", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    const decreaseBtn = screen.getByRole("button", { name: "decreasePracticeProgressLabel" });
    fireEvent.click(decreaseBtn);

    expect(handleChange).toHaveBeenCalledWith(40);
  });

  it("does not exceed 100 when increasing", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={95} onChange={handleChange} />);

    const increaseBtn = screen.getByRole("button", { name: "increasePracticeProgressLabel" });
    fireEvent.click(increaseBtn);

    expect(handleChange).toHaveBeenCalledWith(100);
  });

  it("does not go below 0 when decreasing", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={5} onChange={handleChange} />);

    const decreaseBtn = screen.getByRole("button", { name: "decreasePracticeProgressLabel" });
    fireEvent.click(decreaseBtn);

    expect(handleChange).toHaveBeenCalledWith(0);
  });

  it("calls onChange when slider is changed", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "75" } });

    expect(handleChange).toHaveBeenCalledWith(75);
  });

  it("keeps focus on interactive controls instead of the progress region", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    expect(screen.getByRole("region", { name: "practiceProgressRegionLabel" })).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("ignores invalid slider input gracefully", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={50} onChange={handleChange} />);

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "invalid" } });

    expect(handleChange).not.toHaveBeenCalled();
  });

  it("disables increase button when progress is 100", () => {
    const handleChange = vi.fn();
    render(<PracticeProgress progress={100} onChange={handleChange} />);

    const increaseBtn = screen.getByRole("button", { name: "increasePracticeProgressAtMax" }) as HTMLButtonElement;
    expect(increaseBtn).toHaveAttribute("aria-disabled", "true");
    expect(increaseBtn).toHaveAttribute("title", "increasePracticeProgressAtMax");

    const clickEvent = createEvent.click(increaseBtn);
    fireEvent(increaseBtn, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
  });
});
