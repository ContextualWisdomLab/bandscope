# Checkerboard novelty parity and vectorization evidence

## Scope

This note documents the mathematical and numerical contract for BandScope's checkerboard-novelty implementation in `services/analysis-engine/src/bandscope_analysis/sections/segmenter.py` and the production Rust kernel in `services/analysis-engine/rust/src/lib.rs`. It is intentionally narrower than an end-to-end claim about music-structure accuracy: the change vectorizes an established reference computation and preserves Rust/NumPy numerical parity; it does not introduce a new segmentation model or claim improved boundary-detection accuracy.

Primary and current review sources were rechecked on 2026-08-15. The 2024 TISMIR tutorial remains a current peer-reviewed tutorial treatment of novelty functions for music signal processing, while Foote (2000) is the foundational checkerboard/self-similarity formulation and Nieto et al. (2020) remains an authoritative review of audio-based music structure analysis.

## Algorithmic contract

BandScope follows the classical novelty-boundary pattern: a local checkerboard-like kernel is correlated with a patch of a self-similarity representation around the main diagonal, producing a one-dimensional novelty curve whose peaks indicate locally contrasting regions. This is consistent with Foote's original method and with the modern tutorial derivation in Müller and Chiu (2024).

The implementation contract for this PR is:

- each valid `kernel_size × kernel_size` diagonal patch contributes exactly one novelty value;
- the final valid patch is included for both odd and even kernel sizes;
- inputs shorter than a nonzero kernel preserve the established all-zero output;
- `kernel_size == 0` preserves the established all-zero output instead of constructing an invalid `n + 1` sliding-window range;
- the NumPy implementation uses array views/vectorized contraction rather than Python inner loops and does not intentionally materialize one copy per patch; and
- the Rust production kernel and NumPy reference are required to agree numerically on zero, unit, odd, even, boundary-size, and shorter-than-kernel cases.

The zero-kernel behavior is a backward-compatibility boundary, not a statement that a zero-sized checkerboard has a musically meaningful interpretation. New callers should use a positive analysis kernel; the zero case remains defined so legacy or defensive call paths fail safely and deterministically.

## Numerical evidence required by the repository

The PR's tests separate algorithmic parity from musical-validity claims. They must cover:

1. an independent scalar/oracle calculation for representative nonzero kernels so the vectorized NumPy path is not tested only against itself;
2. Rust-to-NumPy parity after building and installing the native extension;
3. zero, unit, odd, even, exact-boundary, and shorter-than-kernel inputs;
4. finite output and stable output shape; and
5. repository-wide Python statement and branch coverage at 100% for owned production code, plus Rust tests and the normal BandScope quickcheck.

A parity test can prove that the optimized implementation preserves the repository's specified arithmetic. It cannot by itself establish that detected boundaries match human musical-form annotations. End-to-end music-structure quality should therefore be evaluated separately on annotated recordings/datasets with boundary-tolerant MIR metrics rather than inferred from micro-kernel parity.

## Interpretation for product use

Music structure is subjective, ambiguous, and hierarchical; a novelty curve captures one useful segmentation principle rather than a unique ground truth. Nieto et al. (2020) specifically identify novelty/homogeneity, repetition, regularity, subjectivity, ambiguity, and hierarchy as material concerns for production MSA systems. BandScope should therefore treat this checkerboard kernel as one deterministic computational layer within a broader rehearsal-oriented analysis, expose confidence/uncertainty where downstream decisions depend on inferred structure, and avoid presenting a single novelty segmentation as the only valid interpretation of a song.

Müller and Chiu (2024) likewise emphasize that useful novelty functions should be stable, precise, computationally efficient, robust to irrelevant variation, and evaluated with tolerance-aware event metrics. The vectorization in this PR addresses computational efficiency and parity only; it deliberately leaves feature design, peak picking, tolerance windows, and corpus-level boundary accuracy to their respective validated layers.

## References (APA 7th)

Foote, J. (2000). Automatic audio segmentation using a measure of audio novelty. *Proceedings of the 2000 IEEE International Conference on Multimedia and Expo (ICME 2000)*, *1*, 452–455. https://doi.org/10.1109/ICME.2000.869637

Müller, M., & Chiu, C.-Y. (2024). A basic tutorial on novelty and activation functions for music signal processing. *Transactions of the International Society for Music Information Retrieval, 7*(1), 179–194. https://doi.org/10.5334/tismir.202

Nieto, O., Mysore, G. J., Wang, C.-i., Smith, J. B. L., Schlüter, J., Grill, T., & McFee, B. (2020). Audio-based music structure analysis: Current trends, open challenges, and applications. *Transactions of the International Society for Music Information Retrieval, 3*(1), 246–263. https://doi.org/10.5334/tismir.54
