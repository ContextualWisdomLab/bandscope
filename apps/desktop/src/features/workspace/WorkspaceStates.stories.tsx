import type { Meta, StoryObj } from "@storybook/react-vite"

import { ErrorState } from "./WorkspaceStates"

const meta = {
  title: "Workspace/Analysis failure recovery",
  component: ErrorState,
  parameters: { layout: "padded" },
  args: {
    error: "Analysis queue is full. Please wait for a running job to finish.",
    canRetry: true,
    onRetry: () => undefined,
    onChooseAnotherSong: () => undefined,
    actionsDisabled: false,
  },
} satisfies Meta<typeof ErrorState>

export default meta
type Story = StoryObj<typeof meta>

/** Analysis failures keep the admitted song actionable instead of ending at a message-only alert. */
export const RecoverableAnalysisFailure: Story = {}

/** Retry stays visibly unavailable until a song has been admitted, while replacement remains available. */
export const RetryUnavailable: Story = {
  args: {
    error: "Analysis could not start.",
    canRetry: false,
  },
}

/** In-flight recovery prevents duplicate submissions without removing the customer's next actions. */
export const RecoveryInFlight: Story = {
  args: {
    actionsDisabled: true,
  },
}

/** Project persistence failures remain message-only and do not imply that re-analysis is the remedy. */
export const ProjectFailure: Story = {
  args: {
    error: "Failed to save project: Disk full",
    canRetry: false,
    onRetry: undefined,
    onChooseAnotherSong: undefined,
  },
}
