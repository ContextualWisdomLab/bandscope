# ADR-0002: Known-Stem YouTube Quality Gate

Status: Proposed on active branch
Date: 2026-08-09

## Context and drivers

Unit tests with generated mixtures prove arithmetic but not the production downloader, transcoding,
alignment, decoder, model, and stem naming together. A real-world sentinel is required. The fixture
must have creator-published source material, stable integrity metadata, a matching public YouTube
mix, and bounded execution.

## Decision

Use Brad Sucks' *Making Me Nervous* as the first vocal sentinel. Fetch the real YouTube mix through
`download_youtube_audio()`, authenticate both the source archive/exact `vocals.wav` and a separately
pinned creator-hosted finished master, compose the YouTube-to-master and master-to-vocal global
offsets once, score one strongest 12-second vocal window, and run the production
`AudioStemSeparator` with deterministic Demucs `shifts=0`.

The provisional sentinel rejects YouTube/master duration drift above 1.0 seconds or identity
correlation below 0.90, and requires vocal SI-SDR improvement ≥ +0.5 dB plus vocal assignment margin
≥ 3.0 dB. A creator-master calibration measured +1.752 dB and +7.631 dB respectively with
`shifts=0`; it also showed that dry-vocal/mix correlation (0.016856) is not a valid identity check.
Offline metric, alignment, integrity, SSRF/path, cleanup, and failure tests run normally. The live
lane is explicit opt-in, never silently skips after opt-in, and is not scheduled or release-blocking
until rights/platform authorization and an authorized YouTube calibration are recorded.

## Alternatives considered

- Synthetic mixtures only: rejected as insufficient production-boundary evidence.
- Redistribute YouTube/reference audio in git: rejected for rights, repository size, and data
  retention reasons.
- Run live on every PR: rejected until platform authorization, provider stability, model caching,
  cost, and false-failure policy are established.
- Use correlation alone: rejected because correlation cannot prove separation improvement or correct
  semantic stem assignment.
- Independently time-shift every predicted stem: rejected because it can hide separator latency or
  phase defects and inflate scores.

## Consequences

The live lane can fail for provider availability independently of model correctness. That failure is
retained honestly and blocks only that evidence lane. A creator-master probe is calibration
evidence, not proof that the YouTube candidate passes. A single vocal fixture does not establish
four-source or genre-wide validity. Additional fixtures require separate provenance and calibrated
threshold review, not threshold weakening.

## Security, privacy, and legal implications

The test crosses public network, archive, decoder, ffmpeg, model, filesystem, and subprocess trust
boundaries. It uses strict HTTPS/host/size/hash/member allowlists, test-owned temporary storage,
bounded media, sanitized diagnostics, and cleanup. It adds no cookies, credentials, account login,
paywall, DRM, geo, or anti-bot bypass. Creator permission for source files does not itself authorize
automated YouTube access; the operator must verify the intended access against current terms and
rights.

## Acceptance, recovery, and rollback

- Sixteen deterministic contract tests pass in ordinary CI; the root runner explicitly excludes the
  live marker.
- A controlled live run on the exact candidate records all required scores and cleanup evidence.
- Fixture drift causes a distinct pre-model failure.
- Provider/model unavailability remains a failure after explicit opt-in.
- Rollback removes the live gate without removing deterministic metric/security tests or weakening
  production intake controls.

## Supersession triggers

Supersede this ADR when the fixture changes, a four-stem/multi-genre suite is adopted, live execution
becomes scheduled/blocking, the production downloader changes, or a perceptual metric becomes a
release requirement.

## References

- Brad Sucks. (2004, May 3). *Making Me Nervous source*.
  https://www.bradsucks.net/news/archives/2004/05/03/making-me-nervous-source
- Le Roux, J., Wisdom, S., Erdogan, H., & Hershey, J. R. (2019). SDR—Half-baked or well
  done? In *ICASSP 2019* (pp. 626–630). IEEE.
  https://doi.org/10.1109/ICASSP.2019.8683855
- YouTube. (n.d.). *Terms of Service*. https://www.youtube.com/static?template=terms
