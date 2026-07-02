# BandScope Release Policy

## Release source of truth

BandScope distributes release artifacts through GitHub Releases.

## Branch flow

- prepare releases on `release/*`
- merge reviewed release PRs into `main`
- keep `develop` in sync after release merges

## Required release artifacts

- desktop build artifacts
- checksums or equivalent integrity metadata
- release notes
- the latest SBOM
- supplemental inventory for bundled binaries and model artifacts

## Release rules

- release merges do not bypass review or required checks
- release artifacts must remain traceable to the GitHub Release record
- missing SBOM or missing supplemental inventory means the release baseline is incomplete
