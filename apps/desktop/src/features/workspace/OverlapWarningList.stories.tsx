import type { Meta, StoryObj } from "@storybook/react-vite";
import { OverlapWarningList } from "./OverlapWarningList";

const meta = {
  title: "Workspace/OverlapWarningList",
  component: OverlapWarningList,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Shared clash list extracted from Section Roadmap and Ranges. Select the dark or light surface contract so the same next-player warning remains readable in both contexts.",
      },
    },
  },
} satisfies Meta<typeof OverlapWarningList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SharedClashes: Story = {
  args: {
    warnings: ["Bass and vocal share C3", "Keys cover the guitar hook"],
  },
};

export const LightCard: Story = {
  args: {
    warnings: ["Bass and vocal share C3", "Keys cover the guitar hook"],
    surface: "light",
  },
  render: (args) => (
    <div style={{ background: "#fff", padding: "12px", maxWidth: "360px" }}>
      <OverlapWarningList {...args} />
    </div>
  ),
};

export const NoClashes: Story = {
  args: {
    warnings: [],
  },
};