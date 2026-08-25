# Reduced-motion first-bridge navigation

## Buyer-visible contract

Tonight's first labeled bridge is a next action, not a decorative motion. Opening the matching map section must remain usable when the operating system requests reduced motion.

## Behavior

- Workspace `Open` scrolls the renderer-owned song-structure cell for the first labeled bridge.
- When `window.matchMedia("(prefers-reduced-motion: reduce)")` matches, that scroll uses `behavior: "auto"`.
- When reduced motion is not requested, the same scroll uses `behavior: "smooth"`.
- The player `Hear` path is unaffected: it only runs when the owning surface supplies a seek callback.

## Security Notes

- Untrusted input: analysis section identities and times. Navigation uses the renderer-owned section index, not an untrusted id selector.
- Trust boundary: React workspace click handler → existing song-structure grid → `Element.scrollIntoView`.
- Safe failure: missing grid or missing cell leaves the guidance unarmed and does not invent a destination.
- Privacy: no path, payload, or network access is introduced.
- Test points: `FirstBridgeCallout.reduced-motion.test.tsx` locks the `auto` scroll contract.
