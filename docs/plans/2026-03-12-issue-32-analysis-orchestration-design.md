# Issue 32 Analysis Orchestration Design

## Context

BandScope currently has shared rehearsal-domain contracts and a static desktop shell, but no real analysis orchestration. The desktop app does not send typed analysis requests, Tauri exposes no allowlisted commands, and the Python analysis engine only returns a fixed health payload. Issue `#32` requires a secure local orchestration boundary that lets the desktop app start a job, poll its state, and receive a result without opening an unnecessary local HTTP surface.

## Constraints

- `docs/security/app-security.md` prefers direct IPC over a local HTTP listener and requires explicit allowlists plus strict payload validation.
- The current product scope is still bootstrap-level, so the safest first step is a thin orchestration slice, not a full media-analysis pipeline.
- The implementation should preserve `song -> section -> role` output alignment by returning a typed rehearsal song payload.
- Errors must stay user-safe: no raw subprocess stderr dumps and no full source-path leaks in UI-visible messages.
- The implementation must stay local-first and avoid widening trust boundaries beyond React -> Tauri -> Python.

## Approaches Considered

### Approach 1: Tauri IPC to Rust orchestrator to Python subprocess over stdin/stdout

This adds a small set of Tauri commands, keeps the frontend transport narrow, and launches the Python engine as an allowlisted subprocess with argument arrays only. JSON payloads travel through stdin/stdout, which keeps the boundary local without opening a socket.

Trade-offs:
- Pros: smallest secure surface, best match for current security rules, no loopback HTTP token or lifecycle complexity.
- Cons: requires a small CLI entrypoint in Python and result parsing in Rust.

### Approach 2: Tauri IPC to Rust to local Python HTTP service on `127.0.0.1`

This would create a local service for job management and status polling.

Trade-offs:
- Pros: familiar request/response model.
- Cons: broader attack surface, more configuration and auth work, worse fit for the security doc’s IPC preference.

### Approach 3: In-process embedded engine bridge

This would avoid a spawned subprocess and try to run orchestration more tightly inside the desktop app.

Trade-offs:
- Pros: fewer moving runtime pieces.
- Cons: blurs the Rust/Python trust boundary and is unnecessarily complex for the bootstrap phase.

## Decision

Use Approach 1.

BandScope will expose two Tauri commands:
- `start_analysis_job`
- `get_analysis_job_status`

Rust will validate incoming payloads, assign an app-local job id, and run the Python engine as an allowlisted subprocess. Python will validate the request again, emit a structured JSON result, and Rust will persist only the in-memory job state needed for polling.

## Contract Shape

Shared contracts will add:
- `AnalysisJobRequest`
- `AnalysisJobStatus`
- `AnalysisJobSnapshot`
- `AnalysisJobError`

The initial request will keep scope narrow:
- source label
- source kind (`demo` for now)
- requested role focus list

The initial result will return the existing demo rehearsal song fixture through a typed `AnalysisJobStatus` object. This keeps the orchestration slice real while deferring actual audio ingestion to issue `#33`.

## Data Flow

1. React builds a validated `AnalysisJobRequest`.
2. React calls Tauri `start_analysis_job`.
3. Rust validates the payload, creates a job id, stores `queued` state, and spawns Python with JSON over stdin.
4. Python validates the request and returns a structured success envelope containing a rehearsal song payload.
5. Rust stores the terminal state (`succeeded` or `failed`).
6. React polls `get_analysis_job_status` and updates the UI.

## Error Handling

- Unknown request fields or malformed shapes fail at the frontend validation boundary and again at the Rust command boundary.
- Unknown job ids return a typed `not_found` job error.
- Python validation failures return a typed `invalid_request` error.
- Subprocess failures map to a generic `engine_unavailable` error with redacted details.

## Testing

- Shared-types tests for request/status validation helpers.
- Python CLI tests for valid request, invalid request, and structured success payload.
- Desktop tests for request submission and polling UI state via mocked Tauri invoke.
- Rust command tests for unknown job lookup and happy-path job completion if feasible; otherwise keep Rust coverage minimal and validate via end-to-end desktop behavior.

## Security Notes

### Attack surface

React invoke payloads, Rust command handlers, and Python subprocess stdin/stdout.

### Trust boundary

Frontend -> Tauri IPC -> Python engine subprocess.

### Realistic threats

Malformed payload injection, unknown IPC command use, accidental path leakage, and raw subprocess
error exposure.

### Mitigations

Explicit command allowlist, JSON shape validation in all layers, in-memory job store only, redacted
error mapping, and subprocess argument arrays only.

### Remaining risk

The engine still returns a demo payload, so later audio-backed work must preserve the same
validation discipline when real file paths arrive.

### Test points

Reject malformed request shapes, reject unknown job IDs, verify subprocess errors map to typed safe
failures, and verify no local HTTP listener is introduced.
