import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoleSwitcher } from "./RoleSwitcher";

describe("RoleSwitcher", () => {
  it("keeps the all-roles control distinct from a real role whose id is all", () => {
    const onRoleChange = vi.fn();

    render(
      <RoleSwitcher
        roles={[
          { id: "all", name: "Alloy Synth" },
          { id: "bass-guitar", name: "Bass Guitar" }
        ]}
        activeRole="bass-guitar"
        onRoleChange={onRoleChange}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Alloy Synth" }));
    expect(onRoleChange).toHaveBeenLastCalledWith("all");

    fireEvent.click(screen.getByRole("tab", { name: "All Roles" }));
    expect(onRoleChange).toHaveBeenLastCalledWith(null);
  });

  it("uses the project-standard active tab data selector", () => {
    render(
      <RoleSwitcher
        roles={[{ id: "bass-guitar", name: "Bass Guitar" }]}
        activeRole={null}
        onRoleChange={vi.fn()}
      />
    );

    const allRolesTrigger = screen.getByRole("tab", { name: "All Roles" });
    expect(allRolesTrigger.className).toContain("data-active:bg-cyan-300");
    expect(allRolesTrigger.className).not.toContain("data-[state=active]:");
  });
});
