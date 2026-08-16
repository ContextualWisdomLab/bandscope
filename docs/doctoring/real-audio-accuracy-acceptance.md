# Real-audio accuracy acceptance

Next action: before claiming a rehearsal result is accurate, run the Tier 1
decoded-PCM cases. A green unit suite that never opens a WAV is not buyer
evidence.

```bash
uv run --project services/analysis-engine pytest \
  services/analysis-engine/tests/test_accuracy_acceptance.py
```

## Why this lock exists

BandScope sells rehearsal guidance. A buyer cannot distinguish “the job
succeeded” from “the engine heard the chord and tempo that are in the file”
until decoded PCM is scored against a known label (Raffel et al., 2014).

This layer is Tier 1 of issue #770: tiny, license-clean, deterministic WAV
fixtures generated in process. It does not claim genre coverage, perceptual
stem quality, or private-corpus readiness.

## Held cases

- `c-major-triad`: three seconds of C4+E4+G4 written to WAV, decoded, and
  scored with duration-weighted chord recall. Pass when recall of `C` is at
  least `0.70` (Odekerken et al., 2021).
- `click-120-bpm`: eight seconds of 120 BPM clicks decoded by
  `TemporalAnalyzer`. Pass when estimated tempo satisfies Acc1 at 4%
  (Schreiber & Müller, 2020). Acc1 does not credit half-time or double-time.
- Checksum mismatch fails closed. Do not score a tampered file as a pass.

## Claim boundary

A passing case supports only the registered fixture, metric, engine version,
and tolerance. It does not establish universal musical correctness.

When the `other` stem is measured, keys-left, keys-right, acoustic-guitar,
and lead vocal share that chord. Arrangement defaults (`C#`, `Emaj7`, `Eb`)
remain only for the no-stem demo path. Do not treat demo defaults as
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

- Attack surface: generated WAV bytes, SHA-256 digests, and decoded PCM
  passed into `ChordRecognizer` and `TemporalAnalyzer`.
- Trust boundary: untrusted audio and manifests; trusted repo-controlled
  fixture generators and metric floors.
- Mitigations: no network, no shell, checksum fail-closed, bounded fixture
  durations, no copyrighted commercial recordings.
- Test points: deterministic digest, C major recall after file decode, 120
  BPM Acc1, checksum mismatch, malformed manifest, silence must not pass as
  C major, measured `other` stem must label keys and guitar as `C`.
