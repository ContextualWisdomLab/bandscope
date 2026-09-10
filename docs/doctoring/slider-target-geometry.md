# Slider target geometry

## Decision

BandScope anchors the reusable Slider thumb's structural extended pointer target to the moving thumb wrapper itself. `SliderThumb` therefore establishes a positioned containing block with `position: relative`, while the existing pseudo-element remains `position: absolute` with `inset: -12px` around the 20×20 CSS-pixel visual thumb.

The decision is intentionally narrower than a browser accessibility claim. The class contract describes a nominal 44×44 CSS-pixel pseudo-element envelope, but source and jsdom evidence alone do not prove that every browser, pointer modality, zoom level, overlap configuration, or assistive technology exposes that entire envelope as an effective target.

## Problem

Before repair, the thumb wrapper supplied the absolutely positioned `::after` pseudo-element but did not establish its own positioning context. CSS Positioned Layout Level 3 specifies that a non-static positioned box establishes an absolute-positioning containing block for descendants and that an absolutely positioned box uses the nearest ancestor that establishes such a block. In BandScope's composition, `SliderControl` and `SliderTrack` are already positioned ancestors. Without `relative` on the thumb wrapper, the pseudo-element intended to enlarge one moving thumb can therefore resolve against an ancestor box instead of the thumb box.

The exact installed Base UI version is `@base-ui/react` 1.7.0. Its `Slider.Thumb` implementation renders a `<div>` containing the visually hidden `<input type="range">`, positions that wrapper absolutely along the slider, and installs the thumb `onPointerDown` handler on the wrapper itself. Its hidden range input is sized to 100% of the wrapper so VoiceOver's focus indicator follows thumb dimensions. This upstream contract makes the wrapper—not an arbitrary track ancestor—the correct structural boundary for BandScope's extended target.

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
- Doctoring `36760768f6de46ea45b8812630e9228993e1363e` first recorded this boundary.
- Intervening `d6401bcef51c1fd75df6bcebd0b6bae3659fe66a` removed the file without replacement traceability; `1b789fd3da443dbe6f7ef01a3739a60eecfa422f` restored it through ordinary ancestry.
- `b17d894c1115da15e2f9d1555d0375e713533ea7` added exact Base UI 1.7.0 and current CSS Positioned Layout evidence. Intervening `1cf14533a958bf8af39985dd3081951861b1039d` restored the earlier document body; this descendant adopts that history but reapplies the still-valid primary-source evidence rather than force-rewriting ancestry.

Hosted RED is not claimed because the production descendant followed before a stable hosted RED run was captured.

## Verification and claim boundary

The focused jsdom contract may prove only that:

- the range input is wrapped by the Slider thumb element;
- the wrapper carries `relative`;
- the pseudo-element carries `absolute` positioning and `-12px` inset tokens; and
- existing keyboard/RTL/vertical/disabled/accessibility regressions continue to compile and run when exact-head CI reaches them.

Upstream source inspection additionally proves that Base UI 1.7.0 attaches thumb pointer-down state to the wrapper and sizes the nested hidden range input to the wrapper. It does not prove BandScope's effective browser target geometry after Tailwind compilation, ancestor clipping, transforms, overlap, zoom, or input-device behavior.

Commercial UI acceptance still requires real browser evidence for pointer and touch acquisition, drag initiation/continuation, overlap with adjacent controls, zoom/reflow, focus-visible paint, forced-colors behavior, and assistive-technology operation. Product-level actual-audio timeline/range semantics, persistence/reload, stale-media races, and locale rendering remain outside this primitive repair.

## Risk and follow-up

A positioned pseudo-element can still fail the intended buyer outcome if it is clipped by an ancestor, loses pointer hit testing, overlaps another target, or behaves differently across browser/zoom/input combinations. The next UI evidence must therefore measure the effective target in the mounted product rather than infer it from source dimensions. If the 44×44 structural envelope cannot be demonstrated without overlap or clipping, the consumer layout or target strategy must change rather than weakening the acceptance test.

## References

Base UI contributors. (2026). *SliderThumb implementation, v1.7.0* [Source code]. GitHub. https://github.com/mui/base-ui/blob/v1.7.0/packages/react/src/slider/thumb/SliderThumb.tsx

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2: Success Criterion 2.5.8 Target Size (Minimum).* https://www.w3.org/TR/WCAG22/#target-size-minimum

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2: Success Criterion 2.5.5 Target Size (Enhanced).* https://www.w3.org/TR/WCAG22/#target-size-enhanced

World Wide Web Consortium. (2025). *CSS Positioned Layout Module Level 3: Containing blocks of positioned boxes.* https://www.w3.org/TR/css-position-3/#def-cb
