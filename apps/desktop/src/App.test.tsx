import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("shows the shared rehearsal overview", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /BandScope Bootstrap/i })).toBeInTheDocument();
    expect(screen.getByText(/wav, mp3, flac, m4a/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Verse 1/i })).toBeInTheDocument();
    expect(screen.getByText(/Bass Guitar/i)).toBeInTheDocument();
    expect(screen.getByText(/Keyboard 1 Right Hand/i)).toBeInTheDocument();
    expect(screen.getByText(/Lead Vocal/i)).toBeInTheDocument();
    expect(screen.getByText(/Section confidence: medium \(model\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/harmony source model/i)).toHaveLength(3);
    expect(screen.getByText(/manual override C#m11 \(user\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Home baseline is wired/i)).toBeInTheDocument();
  });
});
