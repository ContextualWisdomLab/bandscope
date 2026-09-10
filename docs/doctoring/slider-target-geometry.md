# Slider target geometry

## Decision

BandScope anchors the reusable Slider thumb's structural extended pointer target to the moving thumb wrapper itself. `SliderThumb` therefore establishes a positioned containing block with `position: relative`, while the existing pseudo-element remains `position: absolute` with `inset: -12px` around the 20×20 CSS-pixel visual thumb.

The decision is intentionally narrower than a browser accessibility claim. The class contract describes a nominal 44×44 CSS-pixel pseudo-element envelope, but source and jsdom evidence alone do not prove that every browser, pointer modality, zoom level, overlap configuration, or assistive technology exposes that entire envelope as an effective target.

## Problem

Before repair, the thumb wrapper supplied the absolutely positioned `::after` pseudo-element but did not establish its own positioning context. CSS absolute positioning therefore resolved against the nearest positioned ancestor rather than necessarily against the thumb that moves along the track. In BandScope's composition, `SliderControl` and `SliderTrack` are positioned ancestors. That makes the intended "extend this thumb's target" contract structurally ambiguous: the pseudo-element can be positioned from an ancestor box instead of the thumb box.

This matters because a rehearsal timeline/range control is operated repeatedly under time pressure and must remain usable by pointer, touch, and keyboard users. WCAG 2.2 Success Criterion 2.5.8 sets a Level AA minimum target-size/spacing requirement of 24×24 CSS pixels, while Success Criterion 2.5.5 defines 44×44 CSS pixels as the enhanced Level AAA target-size benchmark. A slider is treated as one target for the 2.5.8 spatial-selection note, but that does not remove the need to verify the actual interactive geometry of the product control.

## Constraints

- Keep Base UI's `Slider.Root`, `Control`, `Track`, `Indicator`, and `Thumb` semantics and state-callback `className` contract intact.
- Do not enlarge the visible thumb merely to make a test pass; visible geometry and interaction geometry are separate design decisions.
- Do not claim pointer/touch success from jsdom, static class strings, or Storybook source alone.
- Do not move actual-audio timeline/range authority into this primitive. Active Player and rehearsal semantics remain in their canonical owner.
- Preserve keyboard focus routing, RTL arrow behavior, vertical layout, disabled behavior, and accessible naming already covered by the primitive regression suite.

## Alternatives considered

### Keep the pseudo-element anchored to an ancestor

Rejected. An ancestor-positioned pseudo-element is not a stable representation of the moving thumb's intended target. As the thumb moves, the target geometry must be tied to the thumb wrapper rather than inferred from a track/control containing block.

### Increase the rendered thumb to 44×44 CSS pixels

Rejected for this repair. That would alter visual density, track occlusion, spacing, and layout in every consumer. A buyer-facing sizing change requires design review and real browser evidence, not a local containment fix.

### Remove the extended target until browser E2E exists

Rejected. Removing the structural target would knowingly reduce the intended pointer affordance. The safer intermediate state is to make the existing structure internally coherent, while keeping the delivery gate failed until browser evidence exists.

## RED → repair

- RED `913d981bb7274b944d2161e9376e7c25c9b19c5` adds a regression requiring the range input's thumb wrapper to carry `relative` alongside the existing `after:absolute` and `after:inset-[-12px]` tokens.
- `a800e76c3254b9389ec4e4771150ce57047d7266` removes unrelated Breadcrumb-test drift introduced while authoring the RED and leaves only the intended Slider regression.
- Production `401c68b2ba873801ff418627bd61295c57bbe6b6` adds `relative` to both static and state-callback SliderThumb class paths. Normal flow is unchanged; the thumb now establishes the containing block for its pseudo-element.

Hosted RED is not claimed because the production descendant followed before a stable hosted RED run was captured.

## Verification and claim boundary

The focused jsdom contract may prove only that:

- the range input is wrapped by the Slider thumb element;
- the wrapper carries `relative`;
- the pseudo-element carries `absolute` positioning and `-12px` inset tokens; and
- existing keyboard/RTL/vertical/disabled/accessibility regressions continue to compile and run when exact-head CI reaches them.

Commercial UI acceptance still requires real browser evidence for pointer and touch acquisition, drag initiation/continuation, overlap with adjacent controls, zoom/reflow, focus-visible paint, forced-colors behavior, and assistive-technology operation. Product-level actual-audio timeline/range semantics, persistence/reload, stale-media races, and locale rendering remain outside this primitive repair.

## Risk and follow-up

A positioned pseudo-element can still fail the intended buyer outcome if it is clipped by an ancestor, loses pointer hit testing, overlaps another target, or behaves differently across browser/zoom/input combinations. The next UI evidence must therefore measure the effective target in the mounted product rather than infer it from source dimensions. If the 44×44 structural envelope cannot be demonstrated without overlap or clipping, the consumer layout or target strategy must change rather than weakening the acceptance test.

## References

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2: Success Criterion 2.5.8 Target Size (Minimum).* https://www.w3.org/TR/WCAG22/#target-size-minimum

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2: Success Criterion 2.5.5 Target Size (Enhanced).* https://www.w3.org/TR/WCAG22/#target-size-enhanced

World Wide Web Consortium. (2011). *CSS 2.1: Containing blocks.* https://www.w3.org/TR/CSS21/visudet.html#containing-block-details
