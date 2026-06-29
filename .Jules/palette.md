## 2024-05-18 - Added focus visible styles for keyboard navigation
**Learning:** Interactive inline buttons (like the chord editor) and scrollable regions with `tabIndex={0}` do not automatically get focus visible styles, meaning keyboard users tabbing through won't know they are focused on them. Unlike central `<Button />` components which bake focus states in, these custom inline interactive elements need explicit focus styling.
**Action:** Always add explicit focus visible styles (e.g., `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300`) to custom interactive elements and scrollable regions with `tabIndex={0}` for proper keyboard accessibility.

## 2024-05-24 - Visual tooltips for disabled icon-only buttons
**Learning:** Icon-only buttons with `aria-label` are accessible to screen readers, but sighted users relying on mouse hover don't get context if the `title` attribute is missing, especially when the button is disabled and its purpose is unclear (e.g. "coming soon").
**Action:** Always add a `title` attribute mirroring the `aria-label` (or providing a specific disabled reason) to icon-only buttons so sighted users also receive explanatory tooltips on hover.

## 2026-06-13 - Added screen reader text for tooltip divs
**Learning:** When using `title` attributes on non-interactive elements like icon-only `div`s for tooltips, screen readers might not announce them properly because they aren't focusable. The visual tooltip is not enough for accessibility.
**Action:** Always add a visually hidden `<span className="sr-only">[Tooltip Text]</span>` inside non-interactive elements that rely on a `title` attribute so that screen readers have text content to announce.
## 2026-06-18 - Added keyboard accessibility to scrollable regions
**Learning:** Horizontally scrollable regions (like the `SectionRoadmap` component) are not accessible to keyboard-only users unless they can receive focus. Keyboard users must be able to focus the container to scroll its content using arrow keys.
**Action:** For proper keyboard accessibility in custom scrollable regions, always include `tabIndex={0}`, an appropriate `aria-label`, `role="region"`, and explicit focus visible styling (e.g., `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300`).
## 2026-06-19 - Internationalization
**Learning:** The desktop app uses i18n via json files located in `apps/desktop/src/locales/`
**Action:** When adding new text strings, make sure to add it to all locale files.
## 2026-06-22 - Disabled button tooltips accessibility
**Learning:** Native `disabled` HTML attributes prevent elements from receiving keyboard focus and can block hover events in some browsers. Consequently, placing a `title` attribute directly on a disabled `<Button>` means the tooltip cannot be read by keyboard-only users and may be missed by mouse users.
**Action:** When adding explanatory tooltips to disabled buttons, wrap the button in a focusable `span` (e.g., `<span tabIndex={0} title={...}>`) instead of attaching the `title` directly to the button, ensuring the tooltip is accessible via keyboard navigation.
