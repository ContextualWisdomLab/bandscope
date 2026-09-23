# Structure feature measurement lanes

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Production default: `chroma_cqt`

## Problem

The admitted-track functional-ACC consumer already guaranteed that baseline and candidate received the same immutable decoded PCM object, sample rate, exact duration, and normalized annotation snapshot. It still accepted arbitrary injected segmentation callbacks, however. That left the scientific identity of the actual CQT baseline and STFT candidate outside the repository-owned measurement boundary.

The earlier #1223 optimization shows the intended hypothesis precisely: replace both structure-pipeline uses of `librosa.feature.chroma_cqt` with `librosa.feature.chroma_stft`. Production reverted that change because synthetic timing did not establish real-audio noninferiority. The experiment therefore needs two repository-owned lanes that differ in that representation and nothing else, without changing the production default.

## Decision

BandScope now exposes a closed `ChromaFeature = Literal["cqt", "stft"]` selector inside the existing structure segmenter. The selector is keyword-only on the public segmentation entry points and defaults to `cqt`, so existing production callers retain the protected CQT behavior.

The selected representation propagates through both places where structure semantics depend on chroma:

1. self-similarity/novelty boundary extraction; and
2. mean-chroma repetition grouping used to derive functional section labels.

Using STFT for boundary detection while silently returning to CQT for repetition grouping would not reproduce the #1223 candidate and would make functional-label evidence scientifically ambiguous, so mixed-representation execution is not an allowed lane.

`scripts/research/measure_structure_feature_lanes.py` binds the experiment to the repository-owned segmenter. It accepts only the read-only admitted canonical little-endian float32 PCM memoryview, checks that `duration_seconds == decoded_frames / sample_rate_hz`, creates a zero-copy read-only NumPy view, invokes the selected repository lane, and converts its section labels and boundaries to the canonical research `FunctionalSegment` value object. It opens no path and performs no decoding, networking, subprocess execution, model download, dynamic plugin discovery, label normalization, aggregation, or inferential decision.

`PairedFunctionalAccuracyTrackConsumer.for_registered_cqt_stft_hypothesis()` is the canonical factory for #1225. It fixes the baseline lane to `cqt` and candidate lane to `stft` rather than asking an experiment caller to select those identities at runtime. The generic constructor remains injectable for focused tests, but production scientific execution of this hypothesis should use the registered factory.

## Alternatives rejected

- **Copy the #1223 STFT implementation into a research-only segmenter.** Rejected because duplicated structure logic would drift from the production baseline and would not test the actual code path a later feature-switch PR would use.
- **Switch production to STFT behind the scientific PR.** Rejected because the experiment exists precisely because production acceptance has not yet been established.
- **Change only boundary chroma and leave repetition grouping on CQT.** Rejected because functional section labels would then describe a mixed feature pipeline rather than the registered candidate.
- **Let the experiment runner inject arbitrary callbacks.** Retained only as a test seam; rejected as the canonical scientific identity because callback provenance is not equivalent to a reviewed repository-owned CQT/STFT lane.

## RED → GREEN evidence

- RED `4a0a09d627acc824a96d7b6d7d69417521e183e5` adds executable contracts requiring a repository-owned CQT/STFT lane factory and requiring the selected STFT representation to drive both novelty/boundary and repetition-group extraction. The source at that commit had neither the lane module nor the feature selector.
- GREEN `d9f7604ae89f9851ae93a8ba8df7dc54e832262a` parameterizes the existing structure pipeline while preserving `cqt` as the production default.
- GREEN `3b5f82dab83653176851abb087dd60b7ec7e78d1` adds the admitted-PCM lane adapter with no file/network/subprocess capability.
- `21eeb46ffbd5a17f1cdf7f47fd43a88f965f1d43` binds the paired functional-ACC consumer to those repository-owned lanes through a canonical hypothesis factory.
- `0b0f05f1f19202ce291d36b3891e4aa158183c8e` freezes the factory order as baseline `cqt`, candidate `stft` in regression coverage.

Predecessor workflow results do not transfer to later heads. Hosted evidence must be evaluated on the exact final head of #1228.

## Claim boundary

This change establishes **measurement identity**, not noninferiority. It does not show that STFT preserves rehearsal-relevant structure quality, does not establish a latency advantage, and does not authorize a production default change.

Production acceptance still requires the preregistered rights-cleared real-audio corpus, recognized boundary/deviation/repetition metrics, functional ACC, registered latency/RSS measurements, reviewed aggregation and paired uncertainty, exact runtime/source identities, complete-track fail-closed handling, and a qualifying current-head independent review.

Synthetic fixtures in the lane tests demonstrate wiring and invariants only. They are not scientific acceptance evidence.

## Security Notes

- The lane adapter receives only the immutable decoded PCM handoff already admitted by `verify_structure_corpus.py`; it receives no workstation audio path.
- Feature identity is a two-value closed world and invalid values fail before feature extraction.
- The adapter adds no filesystem, URL, subprocess, network, model-download, plugin-loading, IPC, or export capability.
- NumPy reads directly from the immutable PCM buffer; the adapter rejects a mutable view rather than copying into an untracked scientific input.
- Boundary/label output is validated for cardinality, continuity, finite values, and full admitted-duration coverage before it becomes functional-ACC input.

## Follow-up

The next scientific implementation slice is to add the recognized boundary retrieval/deviation and repetition-group metric adapters to the same admitted-track CQT/STFT lane output, then implement the reviewed preregistered aggregation and paired-uncertainty procedure. Only after those contracts are frozen should the rights-cleared corpus be measured and interpreted within its registered claim boundary.
