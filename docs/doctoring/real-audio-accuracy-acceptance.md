# Real-audio accuracy acceptance

Next action: before claiming a rehearsal result is accurate, run the Tier 1
decoded-PCM cases. A green unit suite that never opens a WAV is not buyer
evidence.

```bash
uv run --project services/analysis-engine pytest \
  services/analysis-engine/tests/test_accuracy_acceptance.py \
  services/analysis-engine/tests/test_accuracy_boolean_fixture_inputs.py \
  services/analysis-engine/tests/test_accuracy_pcm_input_contract.py \
  services/analysis-engine/tests/test_accuracy_manifest_version.py \
  services/analysis-engine/tests/test_accuracy_metric_interval_contract.py \
  services/analysis-engine/tests/test_accuracy_metric_overflow_contract.py
```

## Why this lock exists

BandScope sells rehearsal guidance. A buyer cannot distinguish “the job
succeeded” from “the engine heard the chord and tempo that are in the file”
until decoded PCM is scored against a known label (Raffel et al., 2014).

This layer is Tier 1 of issue #770: tiny, license-clean, deterministic WAV
fixtures generated in process. It does not claim genre coverage, perceptual
stem quality, or private-corpus readiness.

## Held cases

- `c-major-triad`: three seconds of C4+E4+G4 written to WAV, checksummed,
  decoded from those bytes, and scored with duration-weighted chord recall.
  Pass when recall of `C` is at least `0.70`. That floor is a BandScope Tier 1
  tolerance. Matching estimate intervals are clipped to the annotation window
  and unioned before duration is accumulated, so overlapping or duplicate
  estimates cannot count the same annotated time twice or produce recall above
  `1.0`. Annotation and estimate times must be finite non-Boolean numbers before
  clipping, and each estimate interval must have a strictly increasing
  start/end pair; Boolean, NaN, infinite, empty, or reversed timing is invalid
  acceptance evidence and fails closed instead of being silently ignored or
  allowed to fabricate covered duration. File-backed WAV evaluation accepts an
  ordinary mono or multichannel WAV and deterministically downmixes decoded
  multichannel samples to mono before the production recognizer runs. The direct
  `evaluate_c_major_pcm` boundary is narrower: callers must provide a non-empty,
  one-dimensional, finite floating-point mono PCM array and a finite positive
  non-Boolean sample rate. Unresolved multichannel arrays passed directly,
  integer arrays, NaN/infinite samples, or invalid rate evidence are rejected
  rather than coerced at that direct evaluator boundary. The metric family is
  WCSR/CSR (Odekerken et al., 2021; Raffel et al., 2014).
- `click-120-bpm`: eight seconds of 120 BPM clicks decoded by
  `TemporalAnalyzer`. Pass when estimated tempo satisfies Acc1 at 4%
  (Schreiber & Müller, 2020). Acc1 does not credit half-time or double-time.
  Estimated BPM, true BPM, and the tolerance must all be finite non-Boolean
  numbers; Boolean or non-finite metric inputs are invalid acceptance evidence
  and fail closed rather than being recorded as an ordinary miss. This matters
  in Python because `bool` is an integer subtype and would otherwise satisfy
  ordinary numeric comparisons.
- Fixture generation and WAV serialization accept only finite positive
  non-Boolean duration, BPM, and sample-rate evidence. In Python, `True` would
  otherwise act as numeric `1`, which could create a one-second fixture, a
  one-BPM click contract, or a one-Hz WAV while still looking type-compatible at
  runtime. Derived fixture timing must also remain representable: the computed
  fixture sample count, beat interval, and click-pulse width must each be finite
  and must resolve to at least one sample at the requested rate. This prevents a
  nominally valid high BPM from placing multiple beats onto the same sample and
  rejects a low sample rate that produces an all-zero “click” fixture. Inputs
  that overflow or undersample those derived quantities fail closed before
  allocation, loop construction, or file serialization.
- Checksum mismatch fails closed on both file evaluators. Do not score a
  tampered file as a pass.
- Machine-readable case reports are accepted only when the registered
  provenance fields are present and typed, `audio_sha256` is exactly 64
  hexadecimal characters, and `metric_value` is a finite numeric value.
  Boolean, NaN, infinity, overflow-to-float, malformed digest, or missing-field
  evidence fails closed rather than becoming a portable acceptance record.
- When a caller does not provide an explicit engine version, report creation
  resolves the repository product `VERSION`. Missing or empty `VERSION`
  provenance fails closed; `unknown` is not accepted as a substitute for the
  exact engine version required by the accuracy evidence contract.

## Claim boundary

A passing case supports only the registered fixture, metric, engine version,
and tolerance. It does not establish universal musical correctness.

Keys-left, keys-right, and acoustic-guitar roles still carry arrangement
defaults (`C#`, `Emaj7`, `Eb`). Lead vocal harmony is the role that currently
reflects the `other` stem recognizer. Do not treat those defaults as
measured accuracy.

## References

Odekerken, D., Koops, H. V., & Volk, A. (2021). Improving audio chord
estimation by alignment and integration of crowd-sourced symbolic music.
*Transactions of the International Society for Music Information Retrieval,
4*(1), 141–155. https://doi.org/10.5334/tismir.81

Raffel, C., McFee, B., Humphrey, E. J., Salamon, J., Nieto, O., Liang, D., &
Ellis, D. P. W. (2014). MIR_EVAL: A transparent implementation of common MIR
metrics. In *Proceedings of the 15th International Society for Music
Information Retrieval Conference* (pp. 367–372).

Schreiber, H., & Müller, M. (2020). Music tempo estimation: Are we done yet?
*Transactions of the International Society for Music Information Retrieval,
3*(1), 111–125. https://doi.org/10.5334/tismir.43

## Security Notes

- Attack surface: generated WAV bytes, fixture duration/BPM/sample-rate inputs,
  decoded PCM shape/dtype/finiteness/sample-rate evidence, SHA-256 digests,
  recognizer segment timings, tempo estimates, product-version provenance, and
  parsed case-report mappings passed into the accuracy acceptance path.
- Trust boundary: untrusted audio, runtime numeric evidence, decoded buffer
  structure, recognizer output, and manifests; trusted repo-controlled fixture
  definitions, true labels, metric definitions, registered floors, and the
  repository product `VERSION`.
- Mitigations: no network, no shell, checksum fail-closed before C-major
  decode and before tempo scoring, deterministic file-decoder downmix for
  ordinary mono/stereo and bounded multichannel WAV input, a 100 MiB fixture
  byte cap before checksum reads, an eight-channel cap, a 192 kHz sample-rate
  cap, and a 15-minute decoded-duration cap, non-empty finite floating-point
  one-dimensional mono PCM admission at the direct C-major evaluator boundary,
  finite positive non-Boolean decoded sample-rate evidence, overlap-safe chord
  duration, finite non-Boolean annotation/estimate timing, strictly increasing
  estimate intervals, finite non-Boolean tempo metric inputs, finite positive
  non-Boolean fixture duration/BPM/sample-rate inputs, finite derived fixture
  sample count, beat interval, and click-pulse width with a one-sample minimum,
  plus a non-zero click signal check,
  strict SHA-256 syntax, finite-only report metric values including overflow
  rejection, exact non-empty product-version provenance, bounded fixture
  durations, and no copyrighted commercial recordings. Fixture paths are pytest
  temp files; reports store SHA-256 and labels, not waveform bytes.
- Test points: deterministic digest, over-sized fixture rejection before digest
  allocation, C major recall after file decode, ordinary stereo WAV downmix at
  the file-decoder boundary, excessive channel/rate/duration rejection, direct decoded-PCM
  empty/non-floating/non-finite/non-mono rejection and invalid sample-rate
  rejection, overlapping matching intervals do not double-count annotation
  duration, non-finite and Boolean chord annotation/estimate timing rejection,
  empty/reversed estimate interval rejection, silence-on-disk vs in-memory
  triad, 120 BPM Acc1, non-finite and Boolean tempo estimate / truth / tolerance
  rejection, non-finite and Boolean fixture generation/WAV sample-rate
  rejection, derived sample-count overflow and zero-sample rejection, aliased
  zero-signal rejection, beat-interval overflow and sub-one-sample rejection,
  sub-one-sample click-pulse
  rejection, checksum mismatch through both file evaluators, malformed/non-hex
  manifest provenance, NaN/infinity/overflow report rejection, missing/empty
  product `VERSION` rejection, and silence must not pass as C major.
