import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { SectionRoadmap } from "./SectionRoadmap";

const meta = {
  title: "Workspace/SectionRoadmap",
  component: SectionRoadmap,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SectionRoadmap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DemoSong: Story = {
  args: {
    song: createDemoRehearsalSong(),
    activeRole: null,
  },
};
