# Playback-source selector localization traceability

## Problem

The mounted Active Player source selector had production-local English strings for its fieldset legend and all five source choices. The rest of the desktop already resolves buyer-facing copy through the repository locale boundary, so a Korean desktop could show Korean rehearsal controls beside an English-only `Playback source | Full mix | Vocals | Bass | Drums | Other instruments` control.

This was a UI contract defect rather than a source-authority defect. The radio values are revocable opaque playback authorities and must remain byte-for-byte independent from translated copy.

## Constraints

- `apps/desktop/src/i18n/index.ts` is the current locale authority and currently admits only `en | ko`; this slice does not create another locale detector or widen the application-wide locale contract.
- The canonical playback source kinds remain `full_mix | vocals | bass | drums | other`. Translation cannot rename or infer a different scientific source kind.
- `other` remains the existing catch-all source. The English label stays `Other instruments`; Korean uses `그 외 악기` so the copy is not confused with a guitar-specific label.
- Opaque `bandscope-playback` authorities, discovery/session receipts, source switching, revocation and native filesystem authority are unchanged.
- Wider localization, text-expansion/font-fallback and shipped accessibility convergence remain product-level work under #965; this PR must not become a second global localization owner.

## Test-first evidence

RED contract: `84adeb0982dbb4760b1b3e07444ac9bc9d27956b` adds a mounted regression that sets the preferred browser locale to `ko-KR`, admits the same complete five-source native set, and requires Korean accessible names while asserting that every radio retains the exact opaque authority value.

The predecessor component could not satisfy that contract because both the fieldset legend and option labels were hard-coded English strings.

## Causal repair

- `0b25a7f74b11308c83b7d2892d8c70aae1acc414` adds the screen-scoped English resource.
- `0e81410cf23855ccee3978003ef046d6ba067414` adds the equivalent Korean resource.
- `87c991c0ede87ae51e3c8fbb8277e3b17c2a2279` adds a small copy adapter parameterized by the canonical `Locale` type.
- `5addcd4b7976e4f53aca0ad5f4d2c7b39fd64c25` removes component-local buyer copy and resolves the fieldset legend and source labels through `detectPreferredLocale()` plus the screen resource.
- `0d424579cb69913e7d99d12fe30578c28fdeb101` removes an unreachable fallback branch from the typed two-locale adapter. The locale/key types already prove both dictionary dimensions are complete, so retaining an impossible runtime fallback would only create dead coverage surface.

The screen-key resources intentionally live under the existing `apps/desktop/src/locales/{en,ko}` tree. They do not replace the common translator or establish the requested future database-backed/versioned translation ledger; that broader resource lifecycle remains a separate product architecture gap.

## Security and authority effect

No network, filesystem, subprocess, IPC, persistence, credential or model authority is added. Translation is applied only to visible/accessibility copy. Native discovery still returns opaque authorities, the renderer still selects by exact authority, and translated text is never parsed back into a source kind or authority.

## Current acceptance boundary

Source-level EN/KO localization for this selector is implemented, but repository GREEN is not inferred from these commits. The unchanged final head still requires the repository and central exact-head test/coverage/build/security/review gates.

The UI Delivery Gate remains **FAIL** for the complete product requirement. The application-wide locale authority still supports only EN/KO; JA/ZH/VI/ES/DE/FR, CJK/text-expansion/font-fallback evidence, the requested database-backed versioned translation ledger, responsive/browser/screen-reader current-head E2E, and rights-cleared audible Windows/macOS acceptance remain open work. Selected-source project persistence/reload also remains owned by #962 rather than this localization slice.
