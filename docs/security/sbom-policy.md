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

Track package-manager-external supply-chain assets in `supply-chain/supplemental-component-inventory.json`, including:

- bundled binaries such as `ffmpeg` and `yt-dlp`
- model files, weights, and sidecar assets
- checksums or integrity metadata when available
