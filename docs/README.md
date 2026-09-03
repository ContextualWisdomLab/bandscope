# BandScope Documentation Authority

## Canonical set

BandScope decisions must be reconstructable from this repository without chat history. Use these
documents as the non-duplicative authority graph:

- Product intent and acceptance outcomes: `docs/PRD.md`
- Technical contracts and quality gates: `docs/TRD.md`
- System boundaries and ownership: `ARCHITECTURE.md`
- Architecture, UML, deployment, and logical artifact diagrams:
  `docs/architecture/diagrams.md`
- Decision status and supersession: `docs/adr/README.md`
- Current documentation sufficiency and known gaps: `docs/documentation-coverage-matrix.md`
- Real-audio MIR accuracy definitions, claim boundaries, and Issue #770 roadmap:
  `docs/doctoring/real-audio-accuracy-acceptance.md`
- Live known-stem operator procedure and evidence:
  `docs/engineering/youtube-known-stem-validation.md`
- Security source: `docs/security/app-security.md`
- Release and rollback controls: `docs/release/release-policy.md` and
  `docs/operations/deploy-runbook.md`

## Status vocabulary

- `implemented_on_develop`: present on the protected default branch.
- `active_branch`: implemented on an unmerged branch; not shipped.
- `planned`: approved or proposed work without an implementation.
- `research_only`: evidence or experiment with no product commitment.
- `out_of_scope`: an explicit non-goal.

Documents must use these labels when current and future behavior could otherwise be confused. A PR
body, chat transcript, or old implementation plan is evidence, not a replacement for the canonical
set.

## Change rule

Every material product, model, API, workflow, persistence, security, or release change must update
the affected canonical document or state why no documentation change is required. ADRs supersede
earlier decisions; they are not silently rewritten. `scripts/checks/verify_docs.py` enforces the
presence and cross-links of this authority graph.
