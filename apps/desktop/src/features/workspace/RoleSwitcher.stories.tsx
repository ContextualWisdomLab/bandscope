import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { RoleSwitcher } from "./RoleSwitcher";

const roles = [
  { id: "bass-guitar", name: "Bass" },
  { id: "lead-vocal", name: "Lead vocal" },
  { id: "keys-right", name: "Keys RH" },
];

const meta = {
  title: "Workspace/RoleSwitcher",
  component: RoleSwitcher,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RoleSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllRoles: Story = {
  render: function AllRolesStory() {
    const [activeRole, setActiveRole] = useState<string | null>(null);
    return <RoleSwitcher roles={roles} activeRole={activeRole} onRoleChange={setActiveRole} />;
  },
};
