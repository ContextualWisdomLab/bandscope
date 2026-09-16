# Slider target geometry

## Decision

BandScope keeps the reusable Slider thumb's structural extended pointer target on the moving Base UI thumb wrapper. The visible thumb remains 20×20 CSS pixels and the existing `::after` pseudo-element remains `position: absolute` with `inset: -12px`, giving a nominal 44×44 CSS-pixel envelope.

The positioning and focus owners are Base UI, not BandScope utility classes. The exact adopted Base UI 1.8.0 `SliderThumb` implementation renders a wrapper `<div>` with inline `position: absolute` and a nested visually hidden `<input type="range">`. Focus/blur/keyboard handlers are attached to that input; the input is sized to the thumb wrapper so VoiceOver focus geometry follows the thumb. BandScope therefore preserves wrapper `has-[:focus-visible]` styling, does not substitute direct wrapper `:focus-visible`, and does not add a competing `relative` position utility.

Base UI 1.8.0 was released on 2026-09-04. Its Slider-specific release note is `Prevent update loops from unstable refs (#5441)`. The dependency update is useful, but it does not alter the focus or absolute-placement contracts described above.

This decision is narrower than a browser accessibility claim. Source and jsdom evidence can establish component structure and the upstream contract, but they do not prove that every browser, pointer modality, zoom level, overlap configuration, or assistive technology exposes the entire nominal envelope as an effective target.

## Problem and correction

An earlier repair treated the Thumb wrapper as if it were statically positioned and concluded that `after:absolute after:inset-[-12px]` needed a BandScope `relative` class. Exact dependency source disproved that premise: Base UI already positions the wrapper absolutely while computing its value-dependent location. CSS Positioned Layout defines a positioned box as establishing the relevant containing block, so the extra utility was redundant and could encode a false causal narrative.

A later repair then inverted focus ownership by treating the wrapper as the focus target. Base UI's Slider contract has the nested `input type="range"` receive focus. The 1.8.0 source still attaches focus/blur/keyboard handling to that input and sizes the visually hidden input to the wrapper. Therefore the wrapper's focus paint must continue to use `:has(:focus-visible)` while this upstream anatomy remains in force.

The Base UI 1.8.0 adoption commit `18f8d41b0209c56e63363b1c20dfdfaf0eb204ee` correctly advanced the manifest/lock graph but simultaneously removed the focused absolute-placement and nested-input focus regressions plus the corresponding doctoring. That evidence deletion was not justified by the dependency upgrade because the 1.8.0 source retains both contracts. The current repair restores those regressions while preserving the 1.8.0 dependency delta.

This matters because rehearsal timeline/range controls are operated repeatedly under time pressure. WCAG 2.2 Success Criterion 2.5.8 sets a Level AA minimum target-size/spacing requirement of 24×24 CSS pixels, while Success Criterion 2.5.5 defines 44×44 CSS pixels as the enhanced Level AAA benchmark. A slider is treated as one target for the 2.5.8 spatial-selection note, but actual mounted-product geometry still has to be measured.

## Constraints

- Keep Base UI `Slider.Root → Slider.Control → Slider.Track → Slider.Indicator + Slider.Thumb` semantics and state-callback `className` contracts intact.
- Do not override Base UI's value-dependent absolute Thumb positioning with an important or competing position utility.
- Keep wrapper focus styling aligned with the nested range input that actually receives focus; do not replace `:has(:focus-visible)` with wrapper `:focus-visible` while the 1.8.0 anatomy remains in force.
- Preserve named thumbs, range indexes, RTL keyboard behavior, vertical layout, disabled behavior, and the existing `aria-describedby` rehearsal-range contract.
- Do not enlarge the visible thumb merely to make a source test pass; visible geometry and interaction geometry are separate design decisions.
- Do not claim pointer/touch success from jsdom, static class strings, or Storybook source alone.
- Do not move actual-audio timeline/range semantics into this primitive. Active Player/product composition remains the owner of audio-time semantics, selection persistence/reload, and stale-media races.

## Alternatives considered

### Keep `relative` as the claimed anchor

Rejected. Base UI 1.8.0 supplies inline `position: absolute` on the wrapper. An ordinary Tailwind `relative` token neither owns the runtime placement nor proves the pseudo-element geometry.

### Force `position: relative`

Rejected. An important position declaration could override Base UI's absolute placement and break thumb movement along the track.

### Style the wrapper with direct `:focus-visible`

Rejected. In Base UI 1.8.0 the nested range input receives focus. Direct wrapper focus state is therefore not the state that needs painting.

### Remove the focus/placement regressions because the dependency changed

Rejected. The exact 1.8.0 source retains the same relevant anatomy: wrapper `<div>`, nested range input, input-owned focus handlers, and inline absolute placement. A dependency bump is not evidence that an existing contract vanished.

### Increase the rendered thumb to 44×44 CSS pixels

Rejected for this repair. That changes visual density, track occlusion, spacing, and layout in every consumer. A buyer-facing sizing change requires design review and real browser evidence.

### Remove the extended target until browser E2E exists

Rejected. The existing pseudo-element remains structurally attached to the already-positioned thumb wrapper. Removing it would knowingly reduce the intended pointer affordance while not producing browser evidence.

## RED → repair lineage

- Historical RED `913d981bb7274b944d2161e9376e7c25c9b19c5` required a `relative` token. Exact dependency review later showed that premise was wrong; it remains ancestry only.
- Historical production `401c68b2ba873801ff418627bd61295c57bbe6b6` added the redundant token. It did not change Base UI's inline absolute placement.
- Corrective geometry RED `c2ba83274828e4e619add328862a1fb554c192b8` required the rendered wrapper's actual absolute position, preserved the pseudo-element tokens, and rejected the redundant class.
- Historical geometry production `0f530971d6f5b1611b5b5e80e483063d30c359fc` removed `relative`; a later descendant reintroduced it with an incorrect focus-owner premise.
- Focus RED `6c3ca6d40cc9d219b5d0b103d4e7f5f89edb237d` pinned the nested range input and wrapper `has-[:focus-visible]` styling.
- Focus repair `126671b2366f516675cc58dd9488cc8f84ec6a34` restored that contract in both SliderThumb class paths.
- Geometry regression repair `88041422f5ccc41022b36876dd5882f2d32f7841` restored the absolute-position contract and rejected the reintroduced `relative` token.
- Production `480ba908acc70ab38d23f9dfef64c75759400305` removed the redundant token while retaining nested-input focus styling and the extended pseudo-element target.
- Base UI 1.8.0 adoption `18f8d41b0209c56e63363b1c20dfdfaf0eb204ee` preserved production styling but deleted the focused regression assertions and doctoring sections without an upstream contract change.
- Regression restoration `60440b764e1d6eefa0feaed84a905fddba8089d4` restores the absolute-placement and nested-input focus assertions against the 1.8.0 dependency tree.

Hosted RED is not claimed for source-only ancestry unless an exact workflow reached the relevant assertion before repair. The missing-regression finding is source-backed: `18f8d41...` deleted assertions for contracts that the exact 1.8.0 source still implements.

## Verification and claim boundary

The focused jsdom/source contract may prove only that:

- the accessible slider is the nested `input type="range"` inside the Slider thumb wrapper;
- the wrapper carries `has-[:focus-visible]` styling while the nested input owns keyboard focus;
- Base UI 1.8.0 renders the wrapper with `position: absolute`;
- BandScope does not add the misleading `relative` token;
- the pseudo-element retains absolute positioning and `-12px` inset tokens;
- range thumbs remain inside the unclipped Track with distinct accessible names/indexes and the rehearsal-range description; and
- existing RTL/vertical/disabled/accessibility regressions continue to compile and run when exact-head CI reaches them.

This does **not** prove effective browser target geometry or focus paint after Tailwind compilation, ancestor clipping, transforms, overlap, zoom, forced-colors, or input-device behavior. It also does not prove actual-audio timeline semantics, selection persistence/reload, stale-media race handling, or locale rendering.

Commercial UI acceptance still requires mounted-product evidence for pointer/touch acquisition, track press, drag initiation/continuation, multi-thumb collision and overlap, adjacent-control interference, keyboard focus paint, zoom/reflow, forced-colors, Narrator/VoiceOver, and responsive/locale states.

## Risk and follow-up

A pseudo-element can still fail the intended buyer outcome if an ancestor clips it, hit testing does not include it, it overlaps another thumb/control, or behavior differs across browser/zoom/input combinations. Range sliders are especially important because Base UI supports multiple thumbs and collision behavior; a nominal 44×44 envelope can overlap another thumb even when source structure is correct.

The next UI evidence must therefore measure effective targets and drag selection in the mounted product. If the nominal envelope cannot be demonstrated without overlap or clipping, change the consumer layout or target strategy. Do not restore a redundant position class, direct wrapper `:focus-visible`, or weaken acceptance criteria as a substitute for browser evidence.

## References

Base UI contributors. (2026, September 4). *Base UI v1.8.0 release notes* [Software release notes]. https://base-ui.com/react/overview/releases/v1-8-0

Base UI contributors. (2026). *Slider component* [Documentation]. https://base-ui.com/react/components/slider

Base UI contributors. (2026). *SliderThumb implementation, v1.8.0* [Source code]. GitHub. https://github.com/mui/base-ui/blob/v1.8.0/packages/react/src/slider/thumb/SliderThumb.tsx

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2: Success Criterion 2.5.8 Target Size (Minimum).* https://www.w3.org/TR/WCAG22/#target-size-minimum

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2: Success Criterion 2.5.5 Target Size (Enhanced).* https://www.w3.org/TR/WCAG22/#target-size-enhanced

World Wide Web Consortium. (2025). *CSS Positioned Layout Module Level 3: Containing blocks of positioned boxes.* https://www.w3.org/TR/css-position-3/#def-cb
