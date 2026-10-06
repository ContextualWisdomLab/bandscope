# BandScope SBOM Policy

## Baseline

BandScope generates machine-readable SBOMs in GitHub Actions as a bootstrap control, not as a later release enhancement.

## Format and cadence

- primary format: `CycloneDX JSON`
- run on PRs to `develop` and `main`
- run on pushes to `develop` and `main`
- run on release and version-tag events

## Retention

- upload the SBOM as a GitHub Actions artifact
- attach the SBOM to the GitHub Release before publication through the tag-driven draft release flow
- retain the supplemental component inventory with the SBOM

## Supplemental inventory

Track runtime supply-chain identities that need evidence beyond generated ecosystem SBOM entries in
`supply-chain/supplemental-component-inventory.json`, including:

- lock-managed auxiliary tools such as yt-dlp, cross-checked to `uv.lock`
- operator-provided, non-bundled executables such as ffmpeg and ffprobe
- model files, weights, and sidecar assets
- checksums or integrity metadata when available
