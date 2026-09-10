# Slider target geometry

## Decision

BandScope keeps the reusable Slider thumb's structural extended pointer target on the moving Base UI thumb wrapper. The visible thumb remains 20×20 CSS pixels and the existing `::after` pseudo-element remains `position: absolute` with `inset: -12px`, giving a nominal 44×44 CSS-pixel envelope.

The positioning authority is Base UI itself, not a BandScope `relative` utility. In the exact installed Base UI 1.7.0 implementation, `Slider.Thumb` renders the wrapper with an inline `position: absolute` style as part of thumb placement. An absolutely positioned box establishes the containing block needed by its positioned pseudo-element, so adding a Tailwind `relative` class does not create the anchoring relationship and is redundant under this dependency contract. BandScope therefore does not retain or test that redundant class as evidence.

The decision is intentionally narrower than a browser accessibility claim. Source and jsdom evidence can establish component structure and the upstream positioning contract, but they do not prove that every browser, pointer modality, zoom level, overlap configuration, or assistive technology exposes the entire nominal envelope as an effective target.

## Problem and correction

An earlier repair treated the Thumb wrapper as if it were statically positioned and concluded that `after:absolute after:inset-[-12px]` could resolve against `SliderTrack` or `SliderControl`. That premise was inconsistent with the exact dependency source: Base UI 1.7.0 already sets `position: absolute` on the Thumb wrapper while computing its value-dependent position. CSS Positioned Layout Level 3 defines a positioned box as establishing the relevant absolute-positioning containing block; the wrapper was therefore already the pseudo-element's containing block before BandScope added `relative`.

The earlier `relative` utility was also not a reliable way to describe the runtime position. Base UI supplies `position: absolute` inline, which has higher cascade priority than the ordinary Tailwind class declaration. The class could be present while computed positioning remained absolute. A test that only asserted the `relative` token therefore proved neither the causal fix nor the runtime geometry.

The correction removes the redundant token and pins the actual dependency-backed runtime contract instead: the rendered thumb wrapper remains `position: absolute`, while the pseudo-element remains absolute with a 12-pixel negative inset. This preserves Base UI's thumb-placement semantics and the intended structural target without manufacturing a second positioning authority in the wrapper layer.

This matters because rehearsal timeline/range controls are operated repeatedly under time pressure and must remain usable by pointer, touch, and keyboard users. WCAG 2.2 Success Criterion 2.5.8 sets a Level AA minimum target-size/spacing requirement of 24×24 CSS pixels, while Success Criterion 2.5.5 defines 44×44 CSS pixels as the enhanced Level AAA target-size benchmark. A slider is treated as one target for the 2.5.8 spatial-selection note, but that does not remove the need to verify the actual interactive geometry of the mounted product control.

## Constraints

- Keep Base UI's `Slider.Root`, `Control`, `Track`, `Indicator`, and `Thumb` semantics and state-callback `className` contract intact.
- Do not override Base UI's value-dependent absolute Thumb positioning with an important or competing position utility.
- Do not enlarge the visible thumb merely to make a test pass; visible geometry and interaction geometry are separate design decisions.
- Do not claim pointer/touch success from jsdom, static class strings, or Storybook source alone.
- Do not move actual-audio timeline/range authority into this primitive. Active Player and rehearsal semantics remain in their canonical owner.
- Preserve keyboard focus routing, RTL arrow behavior, vertical layout, disabled behavior, and accessible naming already covered by the primitive regression suite.

## Alternatives considered

### Keep `relative` as the claimed anchor

Rejected. Exact Base UI 1.7.0 already positions the wrapper absolutely. The ordinary class does not supersede the inline runtime position and is not the cause of the containing-block behavior. Retaining it as proof would encode a false implementation narrative.

### Force `position: relative`

Rejected. An important Tailwind position declaration could override Base UI's absolute placement and break thumb movement along the track. BandScope must not replace upstream placement authority merely to make the pseudo-element strategy look self-contained.

### Increase the rendered thumb to 44×44 CSS pixels

Rejected for this repair. That would alter visual density, track occlusion, spacing, and layout in every consumer. A buyer-facing sizing change requires design review and real browser evidence, not a source-only containment change.

### Remove the extended target until browser E2E exists

Rejected. The existing pseudo-element is structurally attached to the already-positioned thumb wrapper and removing it would knowingly reduce the intended pointer affordance. The delivery gate remains failed until effective browser geometry is measured.

## RED → repair

- Historical RED `913d981bb7274b944d2161e9376e7c25c9b19c5` required a `relative` token. Exact dependency review later showed that premise was wrong; it is retained only as ancestry and is not counted as valid target-geometry evidence.
- Historical production `401c68b2ba873801ff418627bd61295c57bbe6b6` added the redundant token. Its presence did not change Base UI's inline `position: absolute` runtime placement.
- Corrective RED `c2ba83274828e4e619add328862a1fb554c192b8` changes the regression to require the rendered wrapper's actual absolute position, preserve the pseudo-element tokens, and reject the redundant `relative` class.
- Production `0f530971d6f5b1611b5b5e80e483063d30c359fc` removes `relative` from both the static and state-callback SliderThumb class paths while leaving Base UI placement and the pseudo-element envelope unchanged.
- This document records the corrected causal model rather than rewriting or deleting the earlier ancestry.

Hosted RED is not claimed unless an exact workflow for `c2ba8327…` reaches the intended assertion before cancellation. The source-level RED is deterministic against its parent because that parent explicitly contains the `relative` class that the corrective regression rejects.

## Verification and claim boundary

The focused jsdom contract may prove only that:

- the range input is wrapped by the Slider thumb element;
- Base UI renders that wrapper with `position: absolute` under the exact installed dependency;
- BandScope does not add the misleading `relative` token;
- the pseudo-element retains absolute positioning and `-12px` inset tokens; and
- existing keyboard/RTL/vertical/disabled/accessibility regressions continue to compile and run when exact-head CI reaches them.

Exact Base UI 1.7.0 source additionally shows that the wrapper's absolute position is derived from slider value/orientation, the thumb pointer handler is installed on the wrapper, and the nested visually hidden range input is sized to the wrapper. This source evidence supports the structural ownership boundary. It does not prove BandScope's effective browser target geometry after Tailwind compilation, ancestor clipping, transforms, overlap, zoom, or input-device behavior.

Commercial UI acceptance still requires real browser evidence for pointer and touch acquisition, drag initiation/continuation, multi-thumb overlap, adjacent-control interference, zoom/reflow, focus-visible paint, forced-colors behavior, and assistive-technology operation. Product-level actual-audio timeline/range semantics, persistence/reload, stale-media races, and locale rendering remain outside this primitive repair.

## Risk and follow-up

A pseudo-element can still fail the intended buyer outcome if it is clipped by an ancestor, loses pointer hit testing, overlaps another thumb or control, or behaves differently across browser/zoom/input combinations. Range sliders are especially important because Base UI supports multiple thumbs and collision behavior; a 44×44 nominal envelope can overlap another thumb even when source structure is correct. The next UI evidence must therefore measure effective targets and drag selection in the mounted product rather than infer success from class tokens.

If the nominal envelope cannot be demonstrated without overlap or clipping, the consumer layout or target strategy must change. Do not restore a redundant positioning class or weaken the acceptance criterion as a substitute for browser evidence.

## References

Base UI contributors. (2026). *SliderThumb implementation, v1.7.0* [Source code]. GitHub. https://github.com/mui/base-ui/blob/v1.7.0/packages/react/src/slider/thumb/SliderThumb.tsx

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2: Success Criterion 2.5.8 Target Size (Minimum).* https://www.w3.org/TR/WCAG22/#target-size-minimum

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2: Success Criterion 2.5.5 Target Size (Enhanced).* https://www.w3.org/TR/WCAG22/#target-size-enhanced

World Wide Web Consortium. (2025). *CSS Positioned Layout Module Level 3: Containing blocks of positioned boxes.* https://www.w3.org/TR/css-position-3/#def-cb
