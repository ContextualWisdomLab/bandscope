"""Regression contract for the repository's NVIDIA NIM OpenCode credential binding."""

from __future__ import annotations

import json
from pathlib import Path


def test_opencode_uses_the_canonical_nvidia_nim_secret_name() -> None:
    """Bind local OpenCode to the organization-standard NVIDIA NIM secret name."""
    repo_root = Path(__file__).resolve().parents[3]
    config = json.loads((repo_root / "opencode.jsonc").read_text(encoding="utf-8"))

    provider = config["provider"]["nvidia-nim"]
    assert provider["options"]["apiKey"] == "{env:NVIDIA_NIM_API_KEY}"
