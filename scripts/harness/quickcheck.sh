#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

python3 scripts/checks/verify_docs.py
python3 scripts/checks/verify_security_notes.py
python3 scripts/checks/security_gates.py
python3 scripts/checks/verify_supply_chain.py
python3 scripts/checks/verify_github_bootstrap_policy.py
npm run lint
npm run typecheck
npm run test
npm run build

if [[ "${BANDSCOPE_ENABLE_RUST_CHECK:-0}" == "1" ]]; then
  ./scripts/checks/check_rust.sh
fi
