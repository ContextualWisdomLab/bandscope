# BandScope Architecture and UML Diagrams

These diagrams describe current `develop` behavior plus the explicitly labeled active known-stem
branch. They do not imply that unmerged work is shipped.

## Component view

```mermaid
flowchart TD
    UI["React rehearsal UI"] -->|"typed IPC"| Rust["Tauri Rust boundary"]
    Rust -->|"stdin/stdout JSON"| Engine["Python analysis engine"]
    Engine --> Separator["htdemucs separator"]
    Engine --> Analysis["section / role / harmony analysis"]
    Contracts["shared TypeScript contracts"] --- UI
    Contracts --- Rust
```

## Known-stem identity and alignment sequence (active branch)

```mermaid
sequenceDiagram
    actor Operator
    participant Test as Pytest benchmark
    participant Intake as Production YouTube intake
    participant Ref as Pinned reference loader
    participant Align as Global aligner
    Operator->>Test: Explicit opt-in
    par Untrusted downloads
        Test->>Intake: Public YouTube URL
        Intake-->>Test: Bounded decoded mix
    and
        Test->>Ref: Archive + master metadata
        Ref-->>Test: Authenticated master + vocals.wav
    end
    Test->>Align: Mix + master + vocal
    Align-->>Test: Identity proof + composed 12 s window
```

## Known-stem inference and scoring sequence (active branch)

```mermaid
sequenceDiagram
    participant Test as Pytest benchmark
    participant Sep as Production htdemucs
    participant Score as SI-SDR scorer
    Test->>Sep: Scored mix window
    Sep-->>Test: vocals / bass / drums / other
    Test->>Score: Stems + mix + reference
    Score-->>Test: Identity, SI-SDRi, assignment margin
```

## Benchmark state model

```mermaid
stateDiagram-v2
    [*] --> Disabled
    Disabled --> Preflight: explicit opt-in
    Preflight --> Fetching: authorization and tools present
    Preflight --> Failed: policy or tool failure
    Fetching --> Aligning: exact IDs and hashes pass
    Fetching --> Failed: download or integrity failure
    Aligning --> Separating: duration and identity pass
    Aligning --> Failed: fixture drift
    Separating --> Scoring: finite canonical stems
    Separating --> Failed: model or shape failure
    Scoring --> Passed: thresholds pass
    Scoring --> Failed: threshold failure
    Passed --> Cleaned
    Failed --> Cleaned
    Cleaned --> [*]
```

## UML class view

```mermaid
classDiagram
    class KnownStemFixture {
      +youtube_url: str
      +video_id: str
      +reference_archive_sha256: str
      +reference_archive_bytes: int
      +reference_member: str
      +reference_member_sha256: str
      +creator_master_sha256: str
      +creator_master_bytes: int
      +target_stem: str
    }
    class AlignedStemWindow {
      +mixture: ndarray
      +reference: ndarray
      +lag_samples: int
      +correlation: float
    }
    class AudioStemSeparator {
      +separate(audio_path) AudioSeparationResult
    }
    class KnownStemBenchmarkWindow {
      +mixture: ndarray
      +reference: ndarray
      +youtube_to_master_lag_samples: int
      +master_to_reference_lag_samples: int
      +identity_correlation: float
    }
    class BenchmarkScore {
      +baseline_si_sdr: float
      +vocal_si_sdr: float
      +improvement_db: float
      +assignment_margin_db: float
    }
    KnownStemFixture --> AlignedStemWindow: authenticates assets
    AlignedStemWindow --> KnownStemBenchmarkWindow: composes two lags
    KnownStemBenchmarkWindow --> AudioStemSeparator: supplies one mix window
    AudioStemSeparator --> BenchmarkScore: supplies named stems
```

`BenchmarkScore` is a logical contract planned for retained evidence; current test assertions compute
these values without instantiating a production class.

## Deployment and trust boundaries

```mermaid
flowchart TB
    subgraph Desktop["User desktop"]
      App["BandScope app"]
      Cache["User-scoped model cache"]
      Temp["Ephemeral media root"]
      App --> Cache
      App --> Temp
    end
    YouTube["YouTube media boundary"] --> App
    Source["Pinned creator archive"] --> App
    Master["Pinned creator master"] --> App
    Model["Official model host"] --> Cache
    App --> Evidence["Bounded numeric evidence"]
```

The model cache is persistent; media temp is not. The public hosts, cache contents, media, decoders,
and model bytes are untrusted until their respective policy and integrity checks pass.

## Logical artifact relationship model (not a physical ERD)

```mermaid
erDiagram
    KNOWN_STEM_FIXTURE ||--|| REFERENCE_ARCHIVE : pins
    KNOWN_STEM_FIXTURE ||--|| CREATOR_MASTER : pins
    KNOWN_STEM_FIXTURE ||--|| YOUTUBE_MIX : identifies
    REFERENCE_ARCHIVE ||--|| REFERENCE_STEM : contains
    YOUTUBE_MIX ||--|| CREATOR_MASTER : identity-checks
    CREATOR_MASTER ||--|| ALIGNED_WINDOW : anchors
    YOUTUBE_MIX ||--|| ALIGNED_WINDOW : yields
    REFERENCE_STEM ||--|| ALIGNED_WINDOW : aligns
    ALIGNED_WINDOW ||--|{ SEPARATED_STEM : produces
    ALIGNED_WINDOW ||--|| BENCHMARK_EVIDENCE : scores
    SEPARATED_STEM }|--|| BENCHMARK_EVIDENCE : contributes
```

Only `KNOWN_STEM_FIXTURE` metadata is version-controlled. `YOUTUBE_MIX`, `CREATOR_MASTER`,
`REFERENCE_STEM`, `ALIGNED_WINDOW`, and `SEPARATED_STEM` bytes are ephemeral.
`BENCHMARK_EVIDENCE` is planned as a bounded artifact, not a database row. ADR-0003 requires a new
physical ERD only if persistence is introduced.
