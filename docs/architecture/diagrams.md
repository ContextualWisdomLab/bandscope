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
    Operator->>Test: Opt-in + runtime identities
    Test->>Test: Verify ffmpeg + ffprobe
    Test->>Ref: Pinned archive metadata
    Ref-->>Test: Authenticated vocals.wav
    Test->>Ref: Pinned master metadata
    Ref-->>Test: Authenticated master file
    Test->>Intake: Public YouTube URL
    Intake-->>Test: Bounded audio filepath
    Test->>Test: Decode three mono signals
    Test->>Align: Mix + master + vocal
    Align-->>Test: Correlation + composed 12 s window
    Test->>Test: Apply identity threshold
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
    Score-->>Test: SI-SDRi + assignment margin
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
    class ModelArtifactSpec {
      +signature: str
      +filename: str
      +sha256: str
      +size_bytes: int
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
    ModelArtifactSpec --> AudioStemSeparator: constrains offline load
    AudioStemSeparator --> BenchmarkScore: supplies named stems
```

`BenchmarkScore` is a logical contract planned for retained evidence; current test assertions compute
these values without instantiating a production class.

## Deployment and trust boundaries

```mermaid
flowchart TB
    subgraph Desktop["User desktop"]
      App["BandScope app"]
      Benchmark["Opt-in known-stem benchmark"]
      Engine["Production analysis engine"]
      ModelFile["Provisioned model file"]
      Temp["Ephemeral media root"]
      App --> Engine
      Benchmark -->|"production intake + separator"| Engine
      Benchmark --> Temp
      ModelFile -->|"verified model bytes"| Engine
    end
    Operator["Authorized operator"] --> Benchmark
    Public["YouTube + pinned creator assets"] --> Benchmark
    Model["Official model host"] --> Provisioner["Trusted model provisioner"]
    Provisioner -->|"cache or exact path"| ModelFile
    Benchmark --> Evidence["Bounded numeric evidence"]
```

The benchmark, not the product app, owns public fixture access and bounded evidence. Model
provisioning is a separate trusted operation; runtime loading never downloads a missing checkpoint.
The provisioned model file is persistent; media temp is not. Public hosts, model locations, media,
decoders, and model bytes are untrusted until their respective policy and integrity checks pass.

## Logical artifact relationship model (not a physical ERD)

```mermaid
erDiagram
    KNOWN_STEM_FIXTURE ||--|| REFERENCE_ARCHIVE : pins
    KNOWN_STEM_FIXTURE ||--|| REFERENCE_ARCHIVE_MEMBER : selects
    KNOWN_STEM_FIXTURE ||--|| CREATOR_MASTER : pins
    KNOWN_STEM_FIXTURE ||--|| YOUTUBE_MIX : identifies
    REFERENCE_ARCHIVE ||--|{ REFERENCE_ARCHIVE_MEMBER : contains
    REFERENCE_ARCHIVE_MEMBER ||--|| REFERENCE_STEM : decodes
    YOUTUBE_MIX ||--|| CREATOR_MASTER : identity-checks
    CREATOR_MASTER ||--|| ALIGNED_WINDOW : anchors
    YOUTUBE_MIX ||--|| ALIGNED_WINDOW : yields
    REFERENCE_STEM ||--|| ALIGNED_WINDOW : aligns
    ALIGNED_WINDOW ||--|{ SEPARATED_STEM : produces
    ALIGNED_WINDOW o|--o| BENCHMARK_EVIDENCE : may-score
    SEPARATED_STEM }o--o| BENCHMARK_EVIDENCE : may-contribute
```

Only `KNOWN_STEM_FIXTURE` metadata is version-controlled. An archive may contain many members, but
the fixture selects and authenticates exactly one `REFERENCE_ARCHIVE_MEMBER` before decoding it as
the reference stem. `YOUTUBE_MIX`, `CREATOR_MASTER`, `REFERENCE_ARCHIVE_MEMBER`, `REFERENCE_STEM`,
`ALIGNED_WINDOW`, and `SEPARATED_STEM` bytes are ephemeral.
`BENCHMARK_EVIDENCE` is planned as a bounded artifact, not a database row. Its aligned-window and
separated-stem relationships are optional because pre-alignment failures (such as the recorded HTTP
502) still produce valid failure evidence. ADR-0003 requires a new physical ERD only if persistence
is introduced.
