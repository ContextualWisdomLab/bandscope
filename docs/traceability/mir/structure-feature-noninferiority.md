# Structure feature noninferiority gate

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225  
Production baseline: `chroma_cqt` in `sections/segmenter.py`

## Decision

The earlier `chroma_cqt` → `chroma_stft` optimization is not a production change until a preregistered, rights-cleared real-audio experiment shows that the candidate is noninferior on rehearsal-relevant structure quality and materially faster on the same corpus and runtime identity.

The repository now owns a result-admission boundary in `scripts/research/validate_structure_noninferiority.py`. The validator does **not** calculate MIR metrics and does not choose scientific margins. It freezes the reviewed experiment contract, binds a result receipt to that contract by canonical SHA-256, requires per-track and aggregate evidence, and applies the registered confidence-interval decision rules. Metric computation remains a separate scientific measurement step.

This keeps a performance result from silently changing the corpus, thresholds, feature identities, or runtime after the measurements are visible.

## Registered inputs

A registration is valid only when it records all of the following before the result is evaluated:

- baseline `chroma_cqt` and candidate `chroma_stft`;
- a rights-cleared real-audio corpus with stable track IDs, audio SHA-256, annotation SHA-256, rights basis, and provenance URI;
- exact source commit and `uv.lock` identity plus Python, librosa, NumPy, sample rate, channel count, and host profile;
- the complete metric implementation contract and noninferiority/speed thresholds.

The validator rejects local filesystem paths as provenance authorities. A benchmark may remain private when licensing requires that, but the receipt must identify the licensed material without leaking the local path that happened to hold it.

The current minimum of two tracks is only a technical guard against treating one timing sample as a corpus. It is **not** a scientific sample-size claim. Corpus breadth, genre/instrumentation coverage, annotation quality, and a defensible power/uncertainty plan remain part of the experiment review before a production switch can be accepted.

## Metrics

BandScope uses MIREX 2025 Music Structure Analysis as the functional-structure reference point. The registered quality gate requires:

| Evidence | Registered implementation / convention | Decision use |
| --- | --- | --- |
| Boundary precision/recall/F at 0.5 s | `mir_eval.segment.detection`, 0.5 s window | F noninferiority |
| Boundary precision/recall/F at 3.0 s | `mir_eval.segment.detection`, 3.0 s window | F noninferiority |
| Boundary median deviation, both directions | `mir_eval.segment.deviation` convention | Report per track and aggregate |
| Functional-label accuracy | MIREX 2025 frame-level ACC convention | Noninferiority |
| Repetition/group consistency | `mir_eval.segment.pairwise`, 0.1 s frame size | F noninferiority |
| Latency | paired p50/p95 on the registered host | p95 ratio superiority |
| Peak memory | peak RSS on the registered host | Report per track and aggregate |

MIREX 2025 evaluates functional structure with frame-level label accuracy plus boundary hit-rate F measures at 0.5 s and 3.0 s. `mir_eval.segment.detection` uses one-to-one boundary matching within the selected tolerance; `mir_eval.segment.deviation` reports the median nearest-boundary deviations in both directions; `mir_eval.segment.pairwise` measures structural grouping agreement. These are different questions and must not be collapsed into one score.

The published MIREX 2025 result table reports the MusicFM baseline at ACC 0.705, HR.5 0.644, and HR3 0.710. Those values are useful external context, **not** BandScope's noninferiority margins. A margin is a product/scientific decision about acceptable loss relative to BandScope's own current baseline on the registered corpus. It must be fixed before examining candidate results.

## Decision rule

For each quality metric `m`, let `Δm = candidate - baseline`. The result passes that quality criterion only when the lower bound of the registered paired 95% confidence interval satisfies:

`lower_CI95(Δm) >= -noninferiority_margin(m)`

For p95 latency, let `r = candidate_p95 / baseline_p95`. The result passes the speed criterion only when the **upper** bound of the paired 95% interval satisfies:

`upper_CI95(r) <= maximum_candidate_ratio`

The validator also requires the aggregate point delta/ratio to lie inside the supplied interval. Favorable point estimates therefore cannot hide an uncertainty interval that crosses a preregistered boundary.

The repository does not currently contain approved numeric margins. Unit-test values are synthetic policy fixtures only and must never be cited as production acceptance thresholds.

## Result receipt

A result receipt must contain the exact registration digest, exact corpus order, one complete baseline/candidate measurement pair per registered track, aggregate measurements, paired 95% intervals for every gated quality metric, a paired p95-latency-ratio interval, failed-track IDs, and a claim boundary.

The receipt is rejected when a track is omitted/reordered, a required metric is absent, a value is non-finite, a confidence interval does not contain its aggregate point estimate, or the registration hash differs. A passing receipt means only that the preregistered decision rule passed for the registered corpus and runtime. It does not generalize automatically to other genres, codecs, sample rates, machines, or annotation regimes.

## Reproducibility sequence

1. Review the rights basis, corpus composition, feature hypothesis, metric contract, host profile, and numeric margins **before** running the candidate.
2. Serialize the registration and run `python scripts/research/validate_structure_noninferiority.py <registration.json>` to obtain its canonical SHA-256.
3. Run baseline and candidate on the same decoded track identities and host profile. Record per-track recognized MIR metrics, p50/p95 latency, peak RSS, failures, and paired uncertainty.
4. Put the registration digest in the result receipt and run `python scripts/research/validate_structure_noninferiority.py <registration.json> <result.json>`.
5. Preserve the registration, result receipt, corpus/annotation hashes, exact source commit, lock hash, and measurement procedure together. A production feature switch requires this evidence plus normal code review and protected-head checks.

No step authorizes committing licensed audio to Git. Rights-cleared means BandScope has the necessary evaluation right; redistribution is a separate permission.

## Security Notes

- Audio and annotation files are untrusted inputs to the future experiment runner. This validator reads JSON evidence only and does not open audio, execute subprocesses, make network requests, or follow paths from the registration.
- `source_uri` is evidence metadata, not an instruction to fetch content. Local absolute paths and `file:` URIs are rejected to avoid turning transient workstation paths into provenance authority or leaking them into review artifacts.
- Audio and annotation SHA-256 values bind measurements to bytes without embedding media in the result receipt.
- Invalid/non-finite measurements, corpus drift, registration drift, missing per-track evidence, and post-hoc metric additions fail closed.
- The validator does not claim that SHA-256 proves licensing, annotation validity, or scientific adequacy. Rights basis and scientific review remain separate gates.

## References

Buisson, M., McFee, B., Essid, S., & Crayencour, H. C. (2024). Self-supervised learning of multi-level audio representations for music segmentation. *IEEE/ACM Transactions on Audio, Speech, and Language Processing, 32*, 2141–2152. https://doi.org/10.1109/TASLP.2024.3379894

Kim, T., & Nam, J. (2023). All-in-one metrical and functional structure analysis with neighborhood attentions on demixed audio. In *2023 IEEE Workshop on Applications of Signal Processing to Audio and Acoustics (WASPAA)* (pp. 1–5). IEEE. https://doi.org/10.1109/WASPAA58266.2023.10248148

MIREX. (2025). *Music Structure Analysis*. https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis

MIREX. (2025). *Music Structure Analysis Results*. https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis_Results

mir_eval contributors. (n.d.). *mir_eval.segment: Structural segmentation evaluation*. https://github.com/mir-evaluation/mir_eval/blob/main/mir_eval/segment.py

Wang, J.-C., Hung, Y.-N., & Smith, J. B. L. (2022). To catch a chorus, verse, intro, or anything else: Analyzing a song with structural functions. In *ICASSP 2022—2022 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)* (pp. 416–420). IEEE. https://arxiv.org/abs/2205.14700