import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfidenceBadge } from "./ConfidenceBadge";

const meta = {
  title: "Workspace/ConfidenceBadge",
  component: ConfidenceBadge,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Figma 19-239 Confidence Badge. Uses workspace tokens; `level` only.",
      },
    },
  },
} satisfies Meta<typeof ConfidenceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Low: Story = { args: { level: "low" } };
export const Medium: Story = { args: { level: "medium" } };
export const High: Story = { args: { level: "high" } };
