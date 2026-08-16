# Workspace lock-in-first card

**Goal:** Name up to three concrete role-and-section pairs on the Rehearsal Priorities card so players can see what to lock in before the room starts.

**Architecture:** The desktop Workspace reads already-validated `RehearsalSong` evidence. High-priority roles are preferred, then medium. When no role-level pair exists, focus-section labels that match a roadmap card, then the first valid section label, are the fallback. Display pairs and focus labels are de-duplicated case-insensitively so repeated verse or chorus evidence cannot consume every slot. Each named action includes the first entrance time. Opening a pair or label selects that role and section, marks the action as current, and scrolls the matching roadmap card into view, using instant scroll when the player prefers reduced motion.

**Tech Stack:** React 19 Workspace card, shared `RehearsalSong` contract, Vitest fixtures from the Late Night Set demo, Storybook inventory under `Workspace/Rehearsal Priorities`.

## Security Notes

### Attack surface

- Analysis payloads already rendered in Workspace: section labels, role names, focus-section strings, and rehearsal-priority enums.

### Trust boundary

- The card consumes `RehearsalSong` after `parseRehearsalSong`. It does not open files, URLs, subprocesses, IPC, WebView, models, or a new persistence path.

### Mitigations

- Render role and section text as React text nodes only.
- Skip blank and case-insensitive `none` sentinels so missing evidence never becomes an instruction.
- De-duplicate display pairs and focus labels so untrusted repeated strings cannot hide later distinct actions.
- Keep English and Korean chrome in locale files; do not interpolate untrusted text into HTML.

### Test points

- High-priority and medium-priority named pairs on the Late Night Set demo.
- Repeated verse labels before chorus: third slot is the distinct chorus pair.
- Empty and `none` sentinels show honest empty copy that points at the section roadmap.
- First-section fallback when every role is low and `focusSections` is empty.
- Unmatched focus labels are omitted so they cannot clear an earlier focus.
- Clicking a named pair or fallback label scrolls that roadmap card into view.
- Each named pair and focus label shows the first entrance time from `section.timeRange.start`.
- The activated lock-in pair exposes `aria-current="true"`.
- Role names that contain `{sectionLabel}` cannot rewrite later aria-label tokens.
- `prefers-reduced-motion: reduce` uses instant `scrollIntoView` instead of smooth animation.

### Realistic threats

- A malformed analysis result could repeat the same verse label and hide the chorus action.
- Empty copy that claims a role click fills this card would send players into a no-op.
- A free-form `focusSections` string such as `bridge` could be sold as a clickable action when no matching card exists, then assign `null` and wipe verse focus.

### Remaining risk

- Role names and `focusSections` remain free-form after parse and enter `aria-label` through one-pass `{token}` interpolation. Workspace does not re-parse `jobResult`. Visible text stays React text nodes.

## References

International Organization for Standardization. (2020). *Ergonomics of human-system interaction — Part 110: Interaction principles* (ISO 9241-110:2020). https://www.iso.org/standard/75258.html

International Organization for Standardization. (2025). *Information technology — W3C Web Content Accessibility Guidelines (WCAG) 2.2* (ISO/IEC 40500:2025).

World Wide Web Consortium. (2024). *Web Content Accessibility Guidelines (WCAG) 2.2* (W3C Recommendation). https://www.w3.org/TR/WCAG22/

World Wide Web Consortium. (2024). Animation from interactions (Success Criterion 2.3.3). In *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/#animation-from-interactions

London, J. (2012). *Hearing in time: Psychological aspects of musical meter* (2nd ed.). Oxford University Press. https://doi.org/10.1093/acprof:oso/9780199744374.001.0001
