Adding translations to `common.json`:
```json
  "partGraphTitle": "Part Handoff Map",
  "partGraphActive": "Active",
  "partGraphResting": "Resting",
  "partGraphTakesOverFrom": "Takes over from",
  "partGraphHandsOffTo": "Hands off to",
  "partGraphNoHandoffs": "No direct handoffs",
```

I will add these to `apps/desktop/src/locales/en/common.json`. Then write `apps/desktop/src/features/workspace/PartGraphMap.tsx` and `apps/desktop/src/features/workspace/PartGraphMap.test.tsx` (using `vi.mock` for `i18n` if necessary, or just real translations).
Wait, actually `PartGraphMap` makes more sense in `workspace` directory.

I will request a plan review for this feature.
