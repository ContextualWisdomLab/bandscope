#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

node scripts/checks/run_python.mjs scripts/checks/run_analysis_command.py python ../../scripts/checks/verify_docs.py
node scripts/checks/run_python.mjs scripts/checks/run_analysis_command.py python ../../scripts/checks/verify_security_notes.py
node scripts/checks/run_python.mjs scripts/checks/security_gates.py
node scripts/checks/run_python.mjs scripts/checks/verify_supply_chain.py
node scripts/checks/run_python.mjs scripts/checks/verify_github_bootstrap_policy.py
npm run lint
npm run typecheck
npm run test
npm run build

if [[ "${BANDSCOPE_ENABLE_RUST_CHECK:-0}" == "1" ]]; then
  ./scripts/checks/check_rust.sh
fi
