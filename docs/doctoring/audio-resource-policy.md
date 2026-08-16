# Audio resource policy evidence

## Scope

This note records the external evidence used by BandScope's versioned local-audio resource policy. It is implementation doctoring, not a claim that BandScope is certified against any external standard.

The current Python policy accepts at most 100 MiB of encoded local-audio input and at most 900 seconds of mono decoded audio at 44.1 kHz, which is 39,690,000 samples. Request metadata is an early rejection hint only: the decoder boundary still checks the opened descriptor's actual size. Decoder calls request one sample beyond the accepted duration and the returned waveform is then validated as a one-dimensional, non-empty, finite floating-point array at exactly 44.1 kHz and no longer than the accepted sample budget before beat tracking or Demucs inference. Policy construction also rejects byte, rate, duration, or derived sample-count limits that cannot be represented within the host's bounded integer/sample-count model, so extreme integer configuration cannot escape through Python-to-float conversion overflow.

## Evidence-to-control mapping

| Evidence | BandScope control |
| --- | --- |
| CWE-770 recommends explicit minimum/maximum resource expectations and limiting resources reachable by unprivileged actors. | `AudioResourcePolicy` makes encoded bytes, decoded samples, sample rate, numeric dtype, shape, finiteness, and checked limit arithmetic explicit fail-closed invariants. CWE-770 is the more specific mapping-friendly weakness beneath the broader CWE-400 resource-consumption class. |
| OWASP ASVS v5.0.0-5.1.1 requires file-handling documentation to define accepted types/extensions and maximum size; v5.0.0-5.2.1 requires accepting only file sizes that can be processed without performance loss or denial of service. | BandScope documents and enforces a finite encoded-byte ceiling before decode, while retaining authoritative descriptor checks at the actual file boundary. ASVS targets web applications/services, so BandScope uses these requirements as security-engineering guidance rather than claiming ASVS conformance for the desktop product. |
| librosa 0.11.0 documents `load(..., duration=...)` as loading only up to the requested duration and returning an ndarray plus the resulting sample rate. | Temporal analysis and stem separation request `max_duration + one sample` as a probe, then reject any returned waveform whose exact decoded sample count exceeds the accepted limit. The post-decode check remains authoritative because a duration argument alone is not treated as proof of resource-policy compliance. |

## Residual risk and follow-up

This policy bounds the Python local-audio decode and downstream model/beat-analysis entry points. It does not yet establish whole-product parity for the desktop/Rust intake path, source channel/rate metadata, peak-memory estimates, CPU/GPU budgets, cancellation latency, or all external decoder behaviors. Those remain tracked by issue #781 and must be proven before that issue closes.

## References

librosa development team. (2025). *librosa.load (librosa 0.11.0)* [Documentation]. https://librosa.org/doc/0.11.0/generated/librosa.load.html

MITRE Corporation. (2026, April 30). *CWE-770: Allocation of resources without limits or throttling (Version 4.20).* Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/770.html

OWASP Foundation. (2025, May). *OWASP Application Security Verification Standard 5.0.0.* https://github.com/OWASP/ASVS/tree/v5.0.0_release/5.0
