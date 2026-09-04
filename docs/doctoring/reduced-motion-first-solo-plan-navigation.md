# First solo-plan runtime and navigation contract

## Buyer outcome

The first-solo callout may name a rehearsal plan only when the current runtime song graph provides an owned, corroborated solo plan for an active role in a labeled section. If that authority cannot be established safely, the customer stays on the rehearsal map and receives the unavailable next-action guidance instead of invented or partially trusted copy.

## Runtime authority boundary

`resolveFirstSoloPlan` treats the incoming song as untrusted runtime data. Before any buyer-visible solo guidance is selected, the graph must satisfy all of these conditions:

- the graph is finite under the repository's bounded property budget;
- only ordinary arrays and plain objects are accepted as structured-data containers; built-in exotics and class instances are rejected;
- every traversed own property is a data property, so application getters are never executed to establish rehearsal authority;
- symbol/function and accessor-backed authority is rejected;
- the graph is compatible with the HTML structured clone algorithm; and
- Proxy objects fail closed rather than supplying fabricated own-property descriptors.

The plain-container check prevents `Map`, `Set`, `Date`, typed arrays, or class instances with attached rehearsal-looking properties from becoming product authority. The structured-clone probe remains a second boundary for Proxy/exotic behavior: the HTML Living Standard requires structured serialization to throw `DataCloneError` for unsupported exotic objects and explicitly gives a proxy object as an example. Descriptor-only preflight therefore avoids executing ordinary getters, while the clone probe prevents a Proxy from becoming buyer-visible authority merely by trapping `getOwnPropertyDescriptor` (WHATWG, 2026).

The resolver continues to require owned role identity, display name, rehearsal priority, bounded section time, unique active graph identity, and a bounded single-line `soloPlan`. Groove, cue, chord, simplification, overlap, setup, fill, tuning, dynamics, articulation, hook, transposition, override, harmonic explanation, and confidence text do not substitute for an owned solo plan.

### Logging and privacy

Rejected rehearsal metadata is not diagnostic payload. The resolver and navigation path do not log buyer-provided `soloPlan` text, role identifiers, section identifiers, or rejected graph contents. A safe failure returns guidance-only state and does not echo the rejected value, path, or object shape into logs. This keeps local rehearsal content on-device and prevents malformed runtime metadata from becoming an observability side channel.

### Validation and test points

The executable regression boundary covers:

- own accessors and Proxy `get` / `getOwnPropertyDescriptor` substitution attempts;
- built-in exotic containers, including a `Map` carrying otherwise valid role metadata;
- malformed, sparse, duplicated, inherited, or unbounded runtime graph data;
- missing and duplicate rendered navigation targets, which must remain unarmed;
- stable `data-section-id` navigation when rendered order changes; and
- `prefers-reduced-motion: reduce`, which must use immediate (`auto`) scrolling.

These checks belong to `resolveFirstSoloPlan`, `FirstSoloPlanCallout`, and the Workspace navigation regressions. New authority paths must extend those executable boundaries rather than relying on prose-only assurance.

## Stable map navigation

The Open action navigates by the exact stable `sectionId`, not by the section's current positional index. The action first requires one unambiguous song-structure renderer in the current workspace scope and then requires exactly one rendered element whose `data-section-id` equals the owned section identity. The id is compared as data rather than interpolated into a CSS selector, so punctuation or selector-like text cannot change selector semantics. Ambiguous or missing targets fail closed and do not switch the customer to the "locked" guidance state.

The shared `SectionRoadmap` component exposes the stable section identity used by this navigation contract. Storybook's `Workspace/First Solo Plan Callout` stories exercise the reusable runtime callout and roadmap in both **Available** and **Unavailable** states rather than duplicating product markup.

## Reduced motion

When the operating-system preference `prefers-reduced-motion: reduce` matches, Open uses `behavior: "auto"` rather than smooth scrolling. W3C's current technique for interaction-triggered JavaScript motion recommends evaluating the reduced-motion media query so non-essential motion can be suppressed (World Wide Web Consortium [W3C], 2026).

## Figma reconciliation status

Repository runtime behavior and Storybook remain the executable source-backed contract. Fresh Figma metadata checked on 2026-08-25 for the repository-declared file `zthWmqfNKUgJBECvv002Qk` exposed only the `00 Cover` page (`16:2`), not the previously documented component-catalog page. This PR therefore does **not** claim a current Figma mapping for the first-solo callout. Figma/Storybook/source reconciliation remains tracked by BandScope issue #965 and must be corrected there before a Figma node is treated as implementation evidence.

## References

WHATWG. (2026). *HTML Living Standard: Safe passing of structured data*. https://html.spec.whatwg.org/multipage/structured-data.html

World Wide Web Consortium. (2026). *SCR40: Using the CSS prefers-reduced-motion query in JavaScript to prevent motion*. https://www.w3.org/WAI/WCAG22/Techniques/client-side-script/SCR40
