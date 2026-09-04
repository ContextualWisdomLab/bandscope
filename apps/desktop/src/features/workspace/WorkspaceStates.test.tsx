import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "./WorkspaceStates";

describe("workspace first-run states", () => {
  it("names try-the-demo and use-my-own-song as the next actions", () => {
    const onTryDemo = vi.fn();
    const onUseOwnSong = vi.fn();
    render(<EmptyState onTryDemo={onTryDemo} onUseOwnSong={onUseOwnSong} />);

    expect(screen.getByRole("heading", { name: /start tonight's rehearsal/i })).toBeTruthy();
    expect(screen.getByText(/your audio stays on this device/i)).toBeTruthy();
    expect(screen.getByText(/original BandScope audio for evaluation/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /try the demo/i }));
    fireEvent.click(screen.getByRole("button", { name: /use my own song/i }));
    expect(onTryDemo).toHaveBeenCalledOnce();
    expect(onUseOwnSong).toHaveBeenCalledOnce();
  });

  it("tells the musician to start analysis after a song is selected", () => {
    render(
      <EmptyState
        selectedLabel="late-night-set.wav"
        onTryDemo={vi.fn()}
        onUseOwnSong={vi.fn()}
      />
    );

    expect(screen.getByText(/start analysis to open tonight's first cue/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /choose a different song/i })).toBeTruthy();
  });

  it("uses general next-step copy for a locally selected song", () => {
    render(
      <EmptyState
        selectedLabel="my-song.wav"
        selectedKind="local"
        onTryDemo={vi.fn()}
        onUseOwnSong={vi.fn()}
      />
    );

    expect(screen.getByText(/start analysis to open your first cue/i)).toBeTruthy();
    expect(screen.queryByText(/tonight's first cue/i)).toBeNull();
  });

  it("does not fire empty-card actions while intake is disabled", () => {
    const onTryDemo = vi.fn();
    const onUseOwnSong = vi.fn();
    render(<EmptyState disabled onTryDemo={onTryDemo} onUseOwnSong={onUseOwnSong} />);

    expect(screen.getByRole("button", { name: /try the demo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /use my own song/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /try the demo/i }));
    fireEvent.click(screen.getByRole("button", { name: /use my own song/i }));
    expect(onTryDemo).not.toHaveBeenCalled();
    expect(onUseOwnSong).not.toHaveBeenCalled();
  });

  it("keeps loading and error copy action-oriented", () => {
    const { rerender } = render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveTextContent(/analyzing audio/i);

    rerender(<ErrorState error="Choose another file." />);
    expect(screen.getByRole("alert")).toHaveTextContent(/choose another file/i);

    rerender(<ErrorState />);
    expect(screen.getByRole("alert")).toHaveTextContent(/an error occurred during analysis/i);
  });

  it("renders without first-run actions when the parent does not pass them", () => {
    render(<EmptyState />);
    expect(screen.queryByRole("button", { name: /try the demo/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /use my own song/i })).toBeNull();
  });
});
