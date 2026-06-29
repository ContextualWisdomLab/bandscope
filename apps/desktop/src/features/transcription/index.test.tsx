import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TranscriptionFeature } from "./index";

describe("TranscriptionFeature", () => {
  it("renders disabled button for non-bass roles", () => {
    render(<TranscriptionFeature roleId="vocals" />);
    const button = screen.getByRole("button", { name: /transcribe part/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "Transcription is currently optimized for Bass. More instruments coming soon."
    );
  });

  it("renders enabled button for bass role", () => {
    render(<TranscriptionFeature roleId="bass" />);
    const button = screen.getByRole("button", { name: /transcribe part/i });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("title", "Transcribe");
  });

  it("handles transcription flow", async () => {
    render(<TranscriptionFeature roleId="bass" />);
    const button = screen.getByRole("button", { name: /transcribe part/i });

    // Initial state
    expect(screen.getByText(/no transcription yet/i)).toBeInTheDocument();

    // Click transcribe
    fireEvent.click(button);

    // Loading state
    expect(screen.getByText(/analyzing pitch/i)).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(screen.getByText(/transcribing\.\.\./i)).toBeInTheDocument();

    // Cancel button appears
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    expect(cancelButton).toBeInTheDocument();

    // Wait for mock data
    await waitFor(() => {
      expect(screen.queryByText(/analyzing pitch/i)).not.toBeInTheDocument();
    });

    // Download button appears
    expect(screen.getByRole("button", { name: /download \.mid/i })).toBeInTheDocument();

    // Mock data rendered (E1, A1, D2)
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("D2")).toBeInTheDocument();
  });

  it("handles cancellation", async () => {
    render(<TranscriptionFeature roleId="bass" />);
    const button = screen.getByRole("button", { name: /transcribe part/i });

    fireEvent.click(button);

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(screen.queryByText(/analyzing pitch/i)).not.toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /transcribe part/i })).toBeInTheDocument();
  });

  it("handles download", async () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    const createObjectURLMock = vi.fn(() => "blob:mockurl");
    const revokeObjectURLMock = vi.fn();

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    render(<TranscriptionFeature roleId="bass" />);
    const button = screen.getByRole("button", { name: /transcribe part/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /download \.mid/i })).toBeInTheDocument();
    });

    const downloadButton = screen.getByRole("button", { name: /download \.mid/i });
    fireEvent.click(downloadButton);

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mockurl");
  });

  it("handles transcription error", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__MOCK_TRANSCRIBE_ERROR = true;

    render(<TranscriptionFeature roleId="bass" />);
    const button = screen.getByRole("button", { name: /transcribe part/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Transcription failed.")).toBeInTheDocument();
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__MOCK_TRANSCRIBE_ERROR;
  });
});
