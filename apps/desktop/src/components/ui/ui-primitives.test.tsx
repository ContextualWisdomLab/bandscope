import { render, waitFor } from "@testing-library/react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { describe, expect, it } from "vitest";
import { badgeVariants } from "./badge";
import { buttonVariants } from "./button";
import { Progress, ProgressTrack } from "./progress";
import { ScrollBar } from "./scroll-area";
import { Tabs, TabsList, TabsTrigger } from "./tabs";

describe("UI primitives", () => {
  it("applies the default button hover state to the button itself", () => {
    const className = buttonVariants({ variant: "default" });

    expect(className).toContain("hover:bg-primary/80");
    expect(className).not.toContain("[a]:hover:bg-primary/80");
  });

  it("applies badge hover states to the rendered anchor badge", () => {
    expect(badgeVariants({ variant: "default" })).toContain("[a&]:hover:bg-primary/80");
    expect(badgeVariants({ variant: "secondary" })).toContain("[a&]:hover:bg-secondary/80");
    expect(badgeVariants({ variant: "destructive" })).toContain("[a&]:hover:bg-destructive/20");
    expect(badgeVariants({ variant: "outline" })).toContain("[a&]:hover:bg-muted");
    expect(badgeVariants({ variant: "outline" })).toContain("[a&]:hover:text-muted-foreground");
    expect(badgeVariants({ variant: "default" })).not.toContain("[a]:hover:bg-primary/80");
  });

  it("renders only custom progress children when supplied", () => {
    const { container } = render(
      <Progress value={50}>
        <ProgressTrack data-testid="custom-track" />
      </Progress>
    );

    expect(container.querySelectorAll('[data-slot="progress-track"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="custom-track"]')).toBeTruthy();
  });

  it("renders default progress chrome when children are only conditional booleans", () => {
    const { container } = render(<Progress value={50}>{false}</Progress>);

    expect(container.querySelectorAll('[data-slot="progress-track"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="progress-indicator"]')).toHaveLength(1);
  });

  it("uses selectors that match the rendered tab orientation attribute", () => {
    const { container } = render(
      <Tabs orientation="vertical">
        <TabsList>
          <TabsTrigger value="lead">Lead</TabsTrigger>
        </TabsList>
      </Tabs>
    );

    const root = container.querySelector('[data-slot="tabs"]');
    const list = container.querySelector('[data-slot="tabs-list"]');
    const trigger = container.querySelector('[data-slot="tabs-trigger"]');

    expect(root?.getAttribute("data-orientation")).toBe("vertical");
    expect(root?.className).toContain("data-[orientation=horizontal]:flex-col");
    expect(root?.className).not.toContain("data-horizontal:flex-col");
    expect(list?.className).toContain("group-data-[orientation=vertical]/tabs:flex-col");
    expect(trigger?.className).toContain("group-data-[orientation=vertical]/tabs:justify-start");
    expect(trigger?.className).not.toContain("group-data-vertical/tabs");
  });

  it("passes orientation to the underlying tab primitive", () => {
    const { container } = render(<Tabs orientation="vertical" />);

    expect(container.querySelector('[data-slot="tabs"]')?.getAttribute("data-orientation")).toBe("vertical");
  });

  it("uses selectors that match the rendered scroll bar orientation attribute", async () => {
    const { container } = render(
      <ScrollAreaPrimitive.Root>
        <ScrollAreaPrimitive.Viewport>Scrollable content</ScrollAreaPrimitive.Viewport>
        <ScrollBar orientation="horizontal" keepMounted />
      </ScrollAreaPrimitive.Root>
    );
    const scrollbar = await waitFor(() => {
      const element = container.querySelector('[data-slot="scroll-area-scrollbar"]');
      if (!element) {
        throw new Error("scrollbar should render inside a scroll area root");
      }
      return element;
    });

    expect(scrollbar.getAttribute("data-orientation")).toBe("horizontal");
    expect(scrollbar.className).toContain("data-[orientation=horizontal]:h-2.5");
    expect(scrollbar.className).toContain("data-[orientation=vertical]:h-full");
    expect(scrollbar.className).not.toContain("data-horizontal:h-2.5");
    expect(scrollbar.className).not.toContain("data-vertical:h-full");
  });
});
