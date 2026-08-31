# Tonight's first tutti

The ready rehearsal map names the first verified full-band hit after a reduced section from existing `partGraph` evidence. A reduction is a named section whose complete graph contains at least one own-property `is_active: false`; the tutti is the first later named section whose complete graph contains exactly one own-property `is_active: true` node for every trustworthy song-wide named role. Repeated section labels are allowed because form labels identify musical sections for players, not unique section identity.

## Next action

- Named: play together from the top of the named section after the reduced earlier section.
- Missing: confirm where every sitting-out part is back in before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It derives a song-wide named-role catalog and checks complete section graphs only.
- Production compatibility: analysis sections expose only active parts in `roles` while `partGraph` retains active and inactive parts. Role identity is therefore resolved song-wide rather than requiring an inactive part to remain in that reduced section's `roles` array.
- Allowlist: role ids and names must be meaningful own-property strings. Each section role list must not duplicate an id or contradict a previously observed name. Each named section graph must contain every expected role exactly once and every graph node must carry an own-property boolean `is_active` flag.
- Safe failure: unknown or duplicate graph ids, missing graph nodes, inherited or missing activity flags, unnamed or contradictory roles, malformed sections, and fewer than two trustworthy song-wide roles return `null` rather than inventing a full-band hit. An opening all-active section is not returned because no earlier reduction exists. When a role is selected, only a verified tutti containing that role is shown.
- Semantic scope: the detector does not infer come-ins, tacets, dropouts, handoffs, Fine, breaths, or other rehearsal semantics from labels or graph handoff fields. Those concepts require their own explicit evidence and tests.
- Logging/privacy: rejected or accepted tuttis are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstTutti.test.ts` covers the demo all-active case, explicit reduction then return, production-shaped inactive-role omission, incomplete graph rejection, duplicate graph identities, repeated form labels, selected-role scoping, inherited and missing activity flags, single-part/incomplete hits, leftover sit-outs, unnamed roles, malformed roots, and literal copy filling.