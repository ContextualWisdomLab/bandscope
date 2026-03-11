# BandScope i18n Policy

## Baseline languages

BandScope keeps Korean and English as the baseline locales.

## Rules

- do not hardcode user-visible copy in feature components when a locale resource is appropriate
- keep locale resources under `apps/desktop/src/locales/<locale>/`
- keep translation keys stable and semantic
- update both Korean and English for new user-visible strings in the desktop app baseline
- document-reader-facing repo docs may stay English-first, but public user-facing product copy should have a Korean and English path when the feature ships
