import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState, ErrorState, LoadingState } from "./WorkspaceStates";

/** Storybook metadata for the workspace empty, loading, and failed states. */
const meta = {
  title: "Workspace/WorkspaceStates",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty workspace before a rehearsal source has been selected. */
export const Empty: Story = {
  render: () => <EmptyState />,
};

/** Workspace while local analysis is still running. */
export const Loading: Story = {
  render: () => <LoadingState />,
};

/** Failed workspace state with actionable decode-error copy. */
export const Failed: Story = {
  render: () => <ErrorState error="Could not decode that take. Choose another file." />,
};
