# Real-audio MIR accuracy acceptance (Issue #770) — first increment

**Goal:** Give a buyer a reproducible answer to “did BandScope hear this audio correctly?” by decoding a rights-safe PCM fixture through the production intake bounds and scoring section-level harmony against a registered expectation.

**Architecture:** A Tier-1 acceptance module writes a deterministic C-major triad WAV, hashes it, decodes it with the same bounded `librosa.load` path used by stem intake, recognizes chords with `ChordRecognizer`, and scores the section-window main chord with `summarize_section_harmony`. The result is a versioned accuracy manifest (audio identity, metric, score, engine name). Later increments add tempo, structure, stems, and a private-corpus lane. This increment does not add network analysis or new dependencies.

**Tech Stack:** Python 3.12, `librosa`, `soundfile`, `numpy`, existing `bandscope_analysis.chords` and `bandscope_analysis.separation` decode bounds.

**Product next action:** After this lands, open a song file in BandScope and treat a green Tier-1 manifest as “this build still hears a known C-major triad.” Do not read a green unit suite as musical accuracy.

## Why this increment

Protected tests today often mock `ChordRecognizer.recognize` or pass in-memory arrays that never crossed a file decode. A buyer cannot tell “the job envelope succeeded” from “the rehearsal harmony is measurably right.” Issue #770 requires decoded PCM through the public analysis boundary, registered metrics, and fail-closed manifest checks (Raffel et al., 2014; Harte, 2010).

Harmony stays `song → section → role`. The fixture is one section window, not a song-wide chord collapse.

```mermaid
flowchart LR
  wav[Deterministic PCM WAV] --> hash[SHA-256 manifest]
  hash --> decode[Bounded production decode]
  decode --> chroma[ChordRecognizer]
  chroma --> section[Section harmony window]
  section --> report[Accuracy manifest]
```

## Task 1 — Harmony fixture and fail-closed manifest

**Files:**
- Add: `services/analysis-engine/src/bandscope_analysis/accuracy/__init__.py`
- Add: `services/analysis-engine/src/bandscope_analysis/accuracy/harmony.py`
- Add: `services/analysis-engine/tests/test_real_audio_accuracy.py`

**Step 1: Write the failing tests**

- C-major WAV decoded through production bounds reports main chord `C` or `C:maj`
- SHA-256 mismatch fails closed
- Malformed fixture records fail closed
- Basename mismatch fails closed

**Step 2: Implement the smallest acceptance runner that makes those tests pass**

**Step 3: Document the metric and citations in this plan and `ARCHITECTURE.md`**

## Later increments (not this PR)

- Tempo Acc1/Acc2 and beat F-measure (Schreiber & Müller, 2020)
- Structure boundary F-measure
- BSSEval-style stem metrics (Stöter et al., 2018)
- CPU/GPU numeric parity on the same fixture
- Tier-2 redistributable corpus and Tier-3 private benchmark

## Security Notes

### Attack surface

Acceptance reads caller-provided fixture paths and JSON-like fixture records. Those are untrusted files and metadata, same class as rehearsal audio intake.

### Trust boundary

Decode crosses the storage and process boundaries: path normalization, file-size cap, duration cap, and basename-only logging. Manifests must not store absolute local paths, credentials, or copyrighted excerpts.

### Mitigations

- Reuse `AudioStemSeparator` path resolve and bounded `librosa.load` (`TARGET_SR`, `MAX_AUDIO_FILE_BYTES`, `MAX_ANALYSIS_DURATION_SECONDS`)
- Reject parent-path segments before resolve
- Compare SHA-256 before treating a fixture as the registered case
- Fail closed on missing or mistyped manifest fields
- No shell, no generic read API, no network

### Test points

- Known C-major triad WAV → expected section main chord
- Tampered bytes → checksum failure
- Missing `expected_dominant_chord` → parse failure
- Path basename ≠ `audio_file_name` → identity failure

### Realistic threats

- A rewritten matcher or decode path could keep mocked job tests green while mis-hearing real audio
- A swapped fixture with the same file name could fake a passing score without a hash check
- Logging a full source path would leak local directory structure

### Remaining risk

- One synthetic triad does not prove genre, inversion, or seventh vocabulary accuracy
- Stem separation is not exercised in this increment; the mix is scored as the section window
- GPU/CPU parity is not yet reported

## References

Harte, C. (2010). *Towards automatic extraction of harmony information from music signals* (Doctoral dissertation). Queen Mary University of London.

Raffel, C., McFee, B., Humphrey, E. J., Salamon, J., Nieto, O., Liang, D., & Ellis, D. P. W. (2014). MIR_EVAL: A transparent implementation of common MIR metrics. In *Proceedings of the 15th International Society for Music Information Retrieval Conference* (pp. 367–372).

Schreiber, H., & Müller, M. (2020). Music tempo estimation: Are we done yet? *Transactions of the International Society for Music Information Retrieval, 3*(1), 111–125. https://doi.org/10.5334/tismir.43

Stöter, F.-R., Liutkus, A., & Ito, N. (2018). The 2018 signal separation evaluation campaign. In *Latent Variable Analysis and Signal Separation*. https://doi.org/10.1007/978-3-319-93764-9_35
