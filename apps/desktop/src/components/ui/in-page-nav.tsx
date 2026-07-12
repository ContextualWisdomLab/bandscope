import * as React from "react"

import { cn } from "@/lib/utils"

/** Render an in-page (table-of-contents) navigation landmark. */
function InPageNav({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="In-page navigation"
      data-slot="in-page-nav"
      className={cn("text-sm", className)}
      {...props}
    />
  )
}

/** Render the list of in-page navigation items. */
function InPageNavList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="in-page-nav-list"
      className={cn("flex flex-col", className)}
      {...props}
    />
  )
}

/** Render a single in-page navigation item. */
function InPageNavItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="in-page-nav-item"
      className={cn("", className)}
      {...props}
    />
  )
}

/**
 * Render an in-page navigation link. The `active` state draws a left
 * indicator bar and emphasizes the label; the `border-l-2` + `pl-3` pair
 * keeps a consistent indicator-to-label gap across states.
 */
function InPageNavLink({
  className,
  active = false,
  ...props
}: React.ComponentProps<"a"> & { active?: boolean }) {
  return (
    <a
      data-slot="in-page-nav-link"
      data-active={active}
      aria-current={active ? "location" : undefined}
      className={cn(
        "block border-l-2 py-1 pl-3 leading-6 transition-colors",
        "border-transparent text-muted-foreground",
        "hover:border-border hover:text-foreground",
        "focus-visible:outline-ring focus-visible:rounded-xs focus-visible:outline-2",
        "data-[active=true]:border-primary data-[active=true]:text-foreground data-[active=true]:font-medium",
        className
      )}
      {...props}
    />
  )
}

export { InPageNav, InPageNavList, InPageNavItem, InPageNavLink }
