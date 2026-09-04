# Figma handoff inventory

## Symptom

Implementers following the Figma-first workflow queried the live BandScope
design file and received only `16:2` `00 Cover`. Repository docs still named
pages `28`–`34` and roots `99:2` … `99:560`, so the handoff looked missing.

## Cause

Figma MCP `get_metadata` without `nodeId` reports the current page, not
`figma.root.children`. Pages `28`–`34` already existed (`37:2`, `38:2`,
`39:2`, `45:86`, `45:270`, `45:316`, `80:2`) but stayed unloaded and therefore
looked empty. Low-detail `104:*` placeholder frames also sat beside the
contract roots on pages `31`–`34`.

## Repair

1. Load each contract page with `figma.setCurrentPageAsync`.
2. Keep one text-bearing root per page (`99:2`, `99:82`, `99:171`, `99:253`,
   `99:415`, `99:714`, `99:560`) and remove the `104:*` placeholders.
3. Commit `docs/design-system/figma-handoff-inventory.json` with page IDs,
   root IDs, and the MCP limitation in plain language.
4. Fail `scripts/checks/verify_figma_handoff.py` when README, workflow, or
   component-contract drift from that inventory. The check reads local files
   only; it does not call Figma or require a token.

## Next action

Open [28 Implementation Contract](https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk?node-id=37-2)
and choose a local audio file in the source-control stack before editing UI.

## Security Notes

- Attack surface: committed JSON and markdown. No Figma credential, URL fetch,
  or paid platform feature enters build, test, or runtime.
- Trust boundary: the inventory is operator-maintained evidence. Live Figma
  remains untrusted input for agents that do query it.
- Mitigations: schema validation, colon-form IDs, required page set, and an
  explicit MCP limitation marker.
- Test points: invalid JSON, missing pages, Cover-only docs, undiscoverable
  pages claimed as current, and the committed repository tree.
- Realistic threats: an agent treating the Cover-only MCP listing as deletion
  of the contract pages; a README that keeps stale root IDs after a real
  Figma rename.
- Remaining risk: a live Figma edit can still drift until the inventory is
  refreshed. The check reports that drift; it does not scrape Figma in CI.
