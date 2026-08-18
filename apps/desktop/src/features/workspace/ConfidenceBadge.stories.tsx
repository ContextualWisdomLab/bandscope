import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfidenceBadge } from "./ConfidenceBadge";

const meta = {
  title: "Workspace/ConfidenceBadge",
  component: ConfidenceBadge,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Figma 19-239 Confidence Badge. Mirrors Level=Low/Medium/High and Size=Compact/Default with workspace tokens; existing call sites remain Compact by default.",
      },
    },
  },
  argTypes: {
    size: {
      control: "select",
      options: ["compact", "default"],
    },
  },
} satisfies Meta<typeof ConfidenceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Low: Story = { args: { level: "low" } };
export const LowDefault: Story = { args: { level: "low", size: "default" } };
export const Medium: Story = { args: { level: "medium" } };
export const MediumDefault: Story = { args: { level: "medium", size: "default" } };
export const High: Story = { args: { level: "high" } };
export const HighDefault: Story = { args: { level: "high", size: "default" } };
