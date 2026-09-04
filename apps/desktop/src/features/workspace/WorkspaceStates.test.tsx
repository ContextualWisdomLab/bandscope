import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "./WorkspaceStates";

describe("WorkspaceStates", () => {
  it("renders the empty prompt that names choosing a song", () => {
    render(<EmptyState />);
    expect(screen.getByText(/ready to analyze/i)).toBeTruthy();
    expect(screen.getByText(/choose an audio file to prepare for your rehearsal/i)).toBeTruthy();
  });

  it("renders a busy analysis status", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(/analyzing audio/i)).toBeTruthy();
  });

  it("keeps project failures as a message-only alert", () => {
    render(<ErrorState error="Failed to save project: Disk full" />);
    expect(screen.getByRole("alert").textContent).toMatch(/an error occurred during analysis/i);
    expect(screen.queryByRole("button", { name: /try this song again/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /choose another song/i })).toBeNull();
  });

  it("names retry and choose-another as the next analysis actions", () => {
    const onRetry = vi.fn();
    const onChooseAnotherSong = vi.fn();
    render(
      <ErrorState
        error="Analysis queue is full. Please wait for a running job to finish."
        canRetry
        onRetry={onRetry}
        onChooseAnotherSong={onChooseAnotherSong}
      />
    );

    expect(screen.getByRole("heading", { name: /analysis didn't finish/i })).toBeTruthy();
    expect(screen.getByText(/this song is still on this device/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try this song again/i }));
    fireEvent.click(screen.getByRole("button", { name: /choose another song/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onChooseAnotherSong).toHaveBeenCalledTimes(1);
  });

  it("disables retry until a song is admitted", () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        error="Analysis could not start."
        canRetry={false}
        onRetry={onRetry}
        onChooseAnotherSong={() => undefined}
      />
    );

    const retry = screen.getByRole("button", { name: /try this song again/i });
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute("title", "Choose a song first");
    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
