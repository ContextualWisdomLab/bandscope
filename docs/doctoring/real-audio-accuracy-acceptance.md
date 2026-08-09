# Real-Audio Accuracy Acceptance Doctoring

Status: Partial implementation on active branch
Tracks: GitHub issue #770
Last updated: 2026-08-09

## Purpose and claim boundary

BandScope needs decoded-audio acceptance evidence that distinguishes “the pipeline ran” from “the
rehearsal output was measurably accurate.” Passing any registered benchmark supports only the exact
versioned fixtures, annotations, model/backend, metrics, and tolerances in its manifest. It does not
establish universal musical correctness, genre/culture invariance, perceptual superiority, or safe
replacement of human rehearsal judgment.

The current active branch implements one vocal source-separation sentinel. It does not complete
issue #770's complete harmony, beat/tempo, structure, range, rehearsal cue, overlap, confidence,
multi-corpus, CPU/GPU, manifest, JSON, or accessible HTML program.

## Evidence tiers

1. Deterministic redistributable PCM: versioned, license-clean generated or checked-in waveforms with
   immutable manifests. They must exercise actual decode, not direct feature arrays.
2. Redistributable public corpus slice: exact audio/annotation license, source/DOI, file hash, split,
   provenance, and transformations.
3. Separately licensed private benchmark: fail closed when credentials/manifest are absent and retain
   only aggregate metrics, bounded error exemplars, configuration hashes, and provenance-safe
   artifacts.

The known-stem YouTube sentinel is an authorization-gated external integration sentinel, not a
substitute for tier 1 or proof that tier 2 redistribution rights exist.

## Metric registry

| Domain | Required metrics | Interpretation boundary | Current status |
|---|---|---|---|
| Source separation | Per-stem SI-SDR/SDR equivalent, improvement over mixture, semantic assignment, mixture consistency, finite output | Energy-ratio metrics do not establish perceptual quality; human listening protocol required for such claims. | Vocal SI-SDRi and assignment implemented on active branch; no passing live score |
| Harmony | Segment chord symbol recall, duration-weighted WCSR, root/major-minor/seventh mappings, no-chord, boundary error | Vocabulary and time alignment must be reported; one opaque aggregate is insufficient. | Planned |
| Beat/tempo | Beat precision/recall/F, continuity-aware metrics, tempo Acc1 and Acc2 | Half/double tempo must remain visible; confidence needs calibration. | Planned |
| Structure | Boundary P/R/F at strict/relaxed windows, segment-label agreement, order/repetition/pickup preservation | A correct label with materially wrong boundary remains an error. | Planned |
| Range | Note/semitone endpoint error and exact out-of-range classification | Stem/role identity and octave policy must be registered. | Planned |
| Rehearsal cues | Entry/dropout/stop/pickup event P/R and timing error | Event tolerance must reflect rehearsal use, not be widened after failure. | Planned |
| Role overlap | Activity interval IoU or registered equivalent | Aggregate overlap must not hide severe role-specific misses. | Planned |
| Confidence | Reliability/calibration curve and Brier-style score where probabilistic | Confidence text without probabilistic semantics is not scored as calibrated. | Planned |

## Regression and uncertainty policy

The first protected baseline is descriptive; thresholds must not be invented as “industry
standard.” Later gates use preregistered practical/statistical tolerances by metric and fixture
family. Dataset and track-level values are retained so aggregates cannot hide severe regressions.
Nondeterministic stages report repeated-run or bootstrap uncertainty. A regression waiver must name
the exact metric/fixture, evidence, owner, expiry, and rollback; silent threshold reduction is
forbidden.

The provisional known-stem thresholds are deliberately limited to the first vocal sentinel. They
must be recalibrated across repeated supported-platform runs before release blocking.

## Manifest and report contract

The planned accuracy manifest records fixture ID/hash/license/provenance, annotations, transforms,
engine/model/backend/version/hash, CPU/GPU device and precision, thread count, elapsed time, peak
RSS/VRAM, metric definitions/version, track- and aggregate-level exact values, registered tolerance,
uncertainty, outcome, limitations, commit/base, and cleanup result. It rejects unknown fields,
malformed manifests, checksum drift, missing configured GPU evidence, and synthetic fallback
presented as corpus success.

Machine-readable JSON and accessible HTML render the same exact values. Neither format contains raw
private audio, copyrighted excerpts, absolute paths, credentials, cookies, or provider response
bodies.

The known-stem slice's narrower schema-v1 `BenchmarkRun`/`BenchmarkEvidence` contract is defined in
`docs/TRD.md`. It is not the complete issue-#770 manifest: it uses sanitized tool/command identities,
stable stage/outcome codes, and optional identity/score blocks so early failures remain valid without
fabricated metrics.

## Rights, security, and privacy

Audio, annotations, metadata, manifests, decoders, model artifacts, and benchmark storage are
untrusted. Enforce bounds for duration, channels, sample rate, decoded bytes, file count, and output
size. Use fixed argument arrays, no shell interpolation, verified manifests/hashes, least privilege,
and explicit storage roots. Ordinary local analysis must not gain a new network dependency because
an acceptance workflow uses authorized external storage.

PII masking is not the control: benchmarks should avoid collecting identity data. Purpose-bound
authorization, non-collection, isolated credentials, bounded evidence, access control, retention,
deletion, and tamper-evident provenance preserve utility without exposing media or identities.

## Operations and rollback

One documented command must eventually run the complete registered acceptance suite and produce
deterministic JSON/HTML. A provider or corpus outage blocks only its tier, never becomes a pass, and
does not stop unrelated engineering. Rollback restores the previous exact manifest/model/backend and
removes unsupported accuracy claims; it does not delete failing evidence, weaken metrics, or replace
real audio with mocks.

Automated known-stem evidence retention remains disabled until ADR-0003's store, access, TTL,
deletion-verification, and incident-owner controls are accepted. A passing run is scoped to its exact
release candidate and OS/architecture; it cannot authorize a claim on a different artifact.

## Current source-separation slice

The active branch:

- crosses the production YouTube downloader and htdemucs separator;
- authenticates a creator-published vocal stem archive, exact extracted member, and separate
  creator-hosted finished master;
- composes YouTube-to-master and master-to-vocal global lags once and scores a 12-second active
  window without aligning predictions independently;
- provisionally requires duration drift ≤ 1.0 s, master identity correlation ≥ 0.90, vocal SI-SDR
  improvement ≥ +0.5 dB, and vocal assignment margin ≥ 3.0 dB;
- passes `shifts=0` to Demucs for deterministic inference;
- runs every collected metric/alignment/integrity/security/cleanup case offline and explicitly
  excludes the live marker from required CI;
- keeps live access explicit opt-in and fail-closed.

On 2026-08-09, the offline contract passed at `5a3648a11d9097b8da48bb4a3ccbd97986aec25b`.
The live attempt failed at YouTube HTTP 502 before model execution, so no passing score exists.
Creator-master calibration produced deterministic +1.752 dB SI-SDR improvement and +7.631 dB
assignment margin, while dry-vocal/mix correlation was only 0.016856. Those results support the
provisional sentinel and separate identity check, not a YouTube pass or release-blocking threshold.
The historical byte-identical implementation tree published on GitHub as exact commit
`6e937a34f9036d92e909db3ce8848a5c39dc8e3b` later passed full quickcheck, but its clean live retry
again failed at YouTube HTTP 502 before separation. That record applies only to the named commit,
not the current head; live success therefore remains absent.

## References

- Le Roux, J., Wisdom, S., Erdogan, H., & Hershey, J. R. (2019). SDR—Half-baked or well
  done? In *ICASSP 2019* (pp. 626–630). IEEE.
  https://doi.org/10.1109/ICASSP.2019.8683855
- National Institute of Standards and Technology. (2023). *Artificial intelligence risk
  management framework (AI RMF 1.0)* (NIST AI 100-1). https://doi.org/10.6028/NIST.AI.100-1
- Odekerken, D., Koops, H. V., & Volk, A. (2021). Improving audio chord estimation by alignment
  and integration of crowd-sourced symbolic music. *Transactions of the International Society for
  Music Information Retrieval, 4*(1), 141–155. https://doi.org/10.5334/tismir.81
- Raffel, C., McFee, B., Humphrey, E. J., Salamon, J., Nieto, O., Liang, D., & Ellis, D. P. W.
  (2014). MIR_EVAL: A transparent implementation of common MIR metrics. In *Proceedings of the
  15th International Society for Music Information Retrieval Conference* (pp. 367–372).
- Schreiber, H., & Müller, M. (2020). Music tempo estimation: Are we done yet?
  *Transactions of the International Society for Music Information Retrieval, 3*(1), 111–125.
  https://doi.org/10.5334/tismir.43
- Stöter, F.-R., Liutkus, A., & Ito, N. (2018). The 2018 signal separation evaluation campaign.
  In *Latent Variable Analysis and Signal Separation*. Springer.
  https://doi.org/10.1007/978-3-319-93764-9_35
