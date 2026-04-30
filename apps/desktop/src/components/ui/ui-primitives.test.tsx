import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("renders only custom progress children when supplied", () => {
    const { container } = render(
      <Progress value={50}>
        <ProgressTrack data-testid="custom-track" />
      </Progress>
    );

    expect(container.querySelectorAll('[data-slot="progress-track"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="custom-track"]')).toBeTruthy();
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

  it("uses selectors that match the rendered scroll bar orientation attribute", () => {
    const scrollbar = ScrollBar({ orientation: "horizontal" }) as {
      props: { className: string; "data-orientation": string };
    };

    expect(scrollbar.props["data-orientation"]).toBe("horizontal");
    expect(scrollbar.props.className).toContain("data-[orientation=horizontal]:h-2.5");
    expect(scrollbar.props.className).toContain("data-[orientation=vertical]:h-full");
    expect(scrollbar.props.className).not.toContain("data-horizontal:h-2.5");
    expect(scrollbar.props.className).not.toContain("data-vertical:h-full");
  });
});
