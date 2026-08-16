import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { StemLab } from "./StemLab";

const meta = {
  title: "Workspace/Stem Lab",
  component: StemLab,
  parameters: { layout: "padded" }
} satisfies Meta<typeof StemLab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeAnalysis: Story = {
  args: { song: null }
};

export const IsolationLanes: Story = {
  args: { song: createDemoRehearsalSong() }
};
