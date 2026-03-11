# BandScope Architecture Overview

## Product shape

BandScope is a local-first desktop app with a React + Tauri shell, shared TypeScript contracts, and a Python analysis service.

## Delivery flow

GitHub is the source of truth for repository governance, PR review, CI/CD, Code Security, dependency review, SBOM retention, and release distribution.

## Local-first principle

- prefer local processing for audio and analysis
- keep risky capabilities narrow, allowlisted, and explicit
- treat files, URLs, models, caches, and release artifacts as untrusted inputs

## CI/CD and release flow

- PRs into `develop` and `main` run CI, dependency review, security audit, secret-scan gate, SBOM generation, and CodeQL
- release flows publish desktop artifacts plus SBOM evidence to GitHub Releases
- branch protection connects stable required checks after bootstrap workflows exist
