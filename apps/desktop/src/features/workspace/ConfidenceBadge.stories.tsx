import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfidenceBadge } from "./ConfidenceBadge";

/** Storybook metadata for the Figma 19-239 confidence-badge level and size matrix. */
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

/** Low-confidence compact badge, matching the backward-compatible Figma compact state. */
export const Low: Story = { args: { level: "low" } };
/** Low-confidence default-size badge from the Figma level/size matrix. */
export const LowDefault: Story = { args: { level: "low", size: "default" } };
/** Medium-confidence compact badge from the Figma level/size matrix. */
export const Medium: Story = { args: { level: "medium" } };
/** Medium-confidence default-size badge from the Figma level/size matrix. */
export const MediumDefault: Story = { args: { level: "medium", size: "default" } };
/** High-confidence compact badge from the Figma level/size matrix. */
export const High: Story = { args: { level: "high" } };
/** High-confidence default-size badge from the Figma level/size matrix. */
export const HighDefault: Story = { args: { level: "high", size: "default" } };
