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
          "Shared clash list extracted from Section Roadmap and Ranges. Uses workspace overlap tokens so both surfaces show the same next-player warning.",
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

export const NoClashes: Story = {
  args: {
    warnings: [],
  },
};
