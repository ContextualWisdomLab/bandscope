# Architecture Decision Records

ADRs are immutable decision records. Amend factual links or typographical errors in place; change a
decision through a new ADR that names the superseded record.

| ADR | Status | Decision |
|---|---|---|
| `0001-source-separation-runtime-and-model-delivery.md` | Proposed on active branch | Use real four-source htdemucs locally, require trusted external provisioning, verify the exact artifact before deserialization, and retain the model-rights/legal delivery decision as a release blocker. |
| `0002-known-stem-youtube-quality-gate.md` | Proposed on active branch | Validate the production YouTube-to-separator path with a creator-published known vocal stem, single alignment, SI-SDR improvement, and assignment margin. |
| `0003-ephemeral-benchmark-evidence-model.md` | Proposed on active branch | Keep media and signal arrays ephemeral; retain only bounded evidence when authorized, so a relational ERD is not currently authoritative. |

Status meanings are `Proposed`, `Accepted`, `Deprecated`, and `Superseded`. An accepted decision may
still carry explicit release blockers; acceptance does not assert that every follow-up is shipped.
