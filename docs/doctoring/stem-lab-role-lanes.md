# Stem Lab role-lane evidence

## Status

**Active draft evidence** for the Stem Lab isolation board. This is not protected-`develop` shipped truth until the implementation is merged and revalidated.

## Buyer problem

The rehearsal cockpit advertised Stem Lab while the control stayed `coming soon`. Players who needed to isolate a part were sent to a dead end, even after analysis had already named roles, ranges, and clashes (International Organization for Standardization, 2020; Nielsen Norman Group, 2024).

## Contract

Stem Lab is a display-only isolation board:

1. Before analysis, tell the player to choose a local audio file and start analysis.
2. After analysis, collapse `song -> section -> role` into one lane per role id.
3. Each lane shows a validated playable range when both range boundaries are valid scientific-pitch labels, the sections to lock first, the merged rehearsal priority, and any overlap warning.
4. First-seen section labels and valid range notes are trimmed before display so padded analysis labels cannot duplicate after merge.
5. Malformed initial range evidence is discarded. If either range boundary remains unavailable, show an explicit ear-check next action instead of presenting malformed text or an empty dash as a playable range.
6. Do not show Play / Loop / Solo controls until a local stem-file contract exists.

This follows self-descriptiveness and suitability-for-the-task: the interface must say what the player can do now, not advertise a control or evidence state that cannot support the task (International Organization for Standardization, 2020; World Wide Web Consortium, 2024).

## Trust boundary and test points

Role names, range labels, section labels, and overlap warnings are analysis-derived presentation data, not trusted UI literals. React text rendering prevents markup execution, while Stem Lab separately validates the scientific-pitch shape used for buyer-facing range claims. A later valid section may replace missing range evidence; later malformed labels cannot widen a valid range.

Direct regressions cover padded first labels, pitch-aware cross-section widening, recovery from initially missing range evidence, rejection of later malformed notes, rejection of malformed first-only range evidence, and the UI fallback that tells the player to verify the part by ear rather than showing a fake playable range.

## Design tokens

Repeating lane surfaces use `--bandscope-stem-lane-border`, `--bandscope-stem-lane-surface`, and `--bandscope-stem-lane-fill` so the board stays on the same token set as the rehearsal cockpit.

## Storybook

`Workspace/Stem Lab` has `BeforeAnalysis` and `IsolationLanes`.

## References

International Organization for Standardization. (2020). *Ergonomics of human-system interaction — Part 110: Interaction principles* (ISO 9241-110:2020). https://www.iso.org/standard/77490.html

Nielsen Norman Group. (2024, January 21). *Placeholder text in form fields is harmful*. https://www.nngroup.com/articles/form-design-placeholders/

World Wide Web Consortium. (2024, December 12). *Web content accessibility guidelines (WCAG) 2.2* (W3C Recommendation). https://www.w3.org/TR/WCAG22/
