# Audio resource policy evidence

## Scope

This note records the external evidence used by BandScope's versioned local-audio resource policy. It is implementation doctoring, not a claim that BandScope is certified against any external standard.

The current Python policy accepts at most 100 MiB of encoded local-audio input and at most 900 seconds of mono decoded audio at 44.1 kHz, which is 39,690,000 samples. The canonical decoded NumPy buffer is additionally bounded to 317,520,000 bytes (39,690,000 samples × 8 bytes), so a decoder cannot stay under the sample ceiling while expanding the admitted in-memory artifact beyond the policy's explicit mono-buffer budget. Request metadata is an early rejection hint only: the decoder boundary still checks the opened descriptor's actual size. Decoder calls request one sample beyond the accepted duration and the returned waveform is then validated as a one-dimensional, non-empty, finite floating-point array at exactly 44.1 kHz and within both the accepted sample count and decoded-buffer byte budget before beat tracking or Demucs inference. Policy construction also rejects byte, memory, rate, duration, or derived sample-count limits that cannot be represented within the host's bounded integer/sample-count model, so extreme integer configuration cannot escape through Python-to-float conversion overflow. YouTube import uses the same encoded-byte ceiling: yt-dlp `max_filesize`, a progress hook that aborts once `downloaded_bytes` / `total_bytes` / `total_bytes_estimate` exceed 100 MiB, a pre-download reject on announced `filesize` / `filesize_approx`, and a post-download `AudioResourcePolicy` check that deletes the artifact. Native local-file and YouTube bootstrap then re-check the filesystem-observed length before storing project state.

## Evidence-to-control mapping

| Evidence | BandScope control |
| --- | --- |
| CWE-770 recommends explicit minimum/maximum resource expectations and limiting resources reachable by unprivileged actors. | `AudioResourcePolicy` makes encoded bytes, decoded samples, decoded mono-buffer bytes, sample rate, numeric dtype, shape, finiteness, and checked limit arithmetic explicit fail-closed invariants. CWE-770 is the more specific mapping-friendly weakness beneath the broader CWE-400 resource-consumption class. |
| OWASP ASVS v5.0.0-5.1.1 requires file-handling documentation to define accepted types/extensions and maximum size; v5.0.0-5.2.1 requires accepting only file sizes that can be processed without performance loss or denial of service. | BandScope documents and enforces a finite encoded-byte ceiling before decode, while retaining authoritative descriptor checks at the actual file boundary. ASVS targets web applications/services, so BandScope uses these requirements as security-engineering guidance rather than claiming ASVS conformance for the desktop product. |
| librosa 0.11.0 documents `load(..., duration=...)` as loading only up to the requested duration and returning an ndarray plus the resulting sample rate. | Temporal analysis and stem separation request `max_duration + one sample` as a probe, then reject any returned waveform whose exact decoded sample count or in-memory byte size exceeds the accepted limits. The post-decode check remains authoritative because a duration argument alone is not treated as proof of resource-policy compliance. |
| yt-dlp documents `max_filesize` as a FileDownloader parameter that skips files larger than the configured byte count, and `progress_hooks` as callbacks that receive `downloaded_bytes`, `total_bytes`, and `total_bytes_estimate`. | YouTube import sets `max_filesize` to `DEFAULT_MAX_ENCODED_FILE_BYTES`, aborts from the progress hook when those byte fields exceed the ceiling, and still revalidates the written file with the canonical policy so a missing or lying size announcement cannot bypass admission. |

## Residual risk and follow-up

This policy now bounds Python decode/model entry by decoded sample count and decoded mono-buffer memory, and bounds native local-file bootstrap plus YouTube download/bootstrap encoded-byte admission. In-flight abort also deletes owned `.part`, `.ytdl`, and `-Frag*` siblings that stay inside that import's output directory; paths that escape the directory are ignored. The decoded-memory limit covers the admitted canonical NumPy audio artifact only; it does not claim to bound downstream temporary arrays, PyTorch tensors, model weights, or accelerator allocations. Remaining #781 work is source channel/rate metadata contracts, explicit per-job CPU/GPU/VRAM admission budgets, cancellation/resource measurements, and whole-product CPU/GPU parity evidence. Do not treat a post-download-only size check as sufficient: in-flight abort and owned-partial deletion must stay in place so an unknown-size transfer cannot fill the cache root.

## References

librosa development team. (2025). *librosa.load (librosa 0.11.0)* [Documentation]. https://librosa.org/doc/0.11.0/generated/librosa.load.html

MITRE Corporation. (2026, April 30). *CWE-770: Allocation of resources without limits or throttling (Version 4.20).* Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/770.html

OWASP Foundation. (2025, May). *OWASP Application Security Verification Standard 5.0.0.* https://github.com/OWASP/ASVS/tree/v5.0.0_release/5.0

yt-dlp contributors. (2026). *FileDownloader parameters (`max_filesize`)* [Source documentation]. https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/downloader/common.py

yt-dlp contributors. (2026). *YoutubeDL `progress_hooks`* [Source documentation]. https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/YoutubeDL.py
