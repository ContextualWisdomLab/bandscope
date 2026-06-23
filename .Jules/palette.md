## 2024-06-23 - Add `aria-label` to Disabled "Coming Soon" Buttons
**Learning:** Adding an `aria-label` to disabled functional buttons correctly communicates the disabled/unavailable state along with the action to screen readers, preventing them from just ignoring or inconsistently parsing `title` tags on disabled elements.
**Action:** Always verify that disabled action elements have descriptive `aria-label`s instead of just relying on `title` tags, as titles alone may be skipped by screen readers.
