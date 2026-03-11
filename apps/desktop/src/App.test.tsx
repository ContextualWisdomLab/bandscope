import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("shows the harness status and supported formats", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /BandScope Bootstrap/i })).toBeInTheDocument();
    expect(screen.getByText(/wav, mp3, flac, m4a/i)).toBeInTheDocument();
    expect(screen.getByText(/Home baseline is wired/i)).toBeInTheDocument();
  });
});
