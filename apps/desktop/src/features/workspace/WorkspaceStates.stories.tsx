import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState, ErrorState, LoadingState } from "./WorkspaceStates";

const meta = {
  title: "Workspace/WorkspaceStates",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <EmptyState />,
};

export const Loading: Story = {
  render: () => <LoadingState />,
};

export const Failed: Story = {
  render: () => <ErrorState error="Could not decode that take. Choose another file." />,
};
