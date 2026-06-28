import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { EmptyState, ErrorState, LoadingState } from "./WorkspaceStates"

describe("WorkspaceStates", () => {
  it("renders the empty state copy", () => {
    render(<EmptyState />)

    expect(screen.getByText("Ready to Analyze")).toBeInTheDocument()
    expect(
      screen.getByText("Choose an audio file to prepare for your rehearsal."),
    ).toBeInTheDocument()
  })

  it("renders loading state accessibility attributes", () => {
    render(<LoadingState />)

    const status = screen.getByRole("status")
    expect(status).toHaveAttribute("aria-live", "polite")
    expect(status).toHaveAttribute("aria-atomic", "true")
    expect(status).toHaveAttribute("aria-busy", "true")
    expect(screen.getByText("Analyzing Audio")).toBeInTheDocument()
    expect(
      screen.getByText("Analyzing the song's form and instrument roles..."),
    ).toBeInTheDocument()
  })

  it("renders the default error message without details", () => {
    render(<ErrorState />)

    const alert = screen.getByRole("alert")
    expect(alert).toHaveAttribute("aria-live", "assertive")
    expect(alert).toHaveAttribute("aria-atomic", "true")
    expect(
      screen.getByText("An error occurred during analysis. Please try again."),
    ).toBeInTheDocument()
  })

  it("renders a custom error message when provided", () => {
    render(<ErrorState error="Custom error message regarding audio parsing" />)

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(
      screen.getByText("An error occurred during analysis. Please try again."),
    ).toBeInTheDocument()
    expect(screen.getByText("Custom error message regarding audio parsing")).toBeInTheDocument()
  })
})
