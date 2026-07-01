## 2026-06-22 - Clear Button for URLs
**Learning:** Adding a clear button (`X`) within URL input containers makes error recovery and URL swapping significantly smoother for users.
**Action:** When adding absolute-positioned elements inside inputs (like an 'X' button on the right), ensure the input has adequate right padding (e.g. `pr-8`) to prevent long text values from visually overlapping the interactive element. Also ensure focus ring is tight and styled cleanly for keyboard navigation.
