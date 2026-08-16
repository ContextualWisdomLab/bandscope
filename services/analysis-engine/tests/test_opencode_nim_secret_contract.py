"""Regression contract for the repository's NVIDIA NIM OpenCode configuration."""

from __future__ import annotations

import json
from pathlib import Path


def test_opencode_uses_the_canonical_nvidia_nim_contract() -> None:
    """Require the reviewed NIM models, process credential alias, and option boundary."""
    repo_root = Path(__file__).resolve().parents[3]
    opencode_text = (repo_root / "opencode.jsonc").read_text(encoding="utf-8")
    config = json.loads(opencode_text)

    assert config["model"] == "nvidia-nim/nvidia/llama-3.3-nemotron-super-49b-v1.5"
    assert config["small_model"] == "nvidia-nim/meta/llama-3.3-70b-instruct"
    assert config["enabled_providers"] == ["nvidia-nim"]
    assert set(config["provider"]) == {"nvidia-nim"}

    provider = config["provider"]["nvidia-nim"]
    assert provider["options"]["baseURL"] == "https://integrate.api.nvidia.com/v1"
    # Central workflows source GitHub Secret NVIDIA_NIM_API_KEY and intentionally
    # expose it to this OpenCode-compatible client through the NVIDIA_API_KEY
    # process alias. The repository config must consume the alias, not rename
    # the organization secret contract.
    assert provider["options"]["apiKey"] == "{env:NVIDIA_API_KEY}"

    primary_model = provider["models"]["nvidia/llama-3.3-nemotron-super-49b-v1.5"]
    assert "reasoningEffort" not in primary_model.get("options", {})
    assert "meta/llama-3.3-70b-instruct" in provider["models"]

    for forbidden_token in (
        "github-models",
        "STRIX_GITHUB_MODELS_TOKEN",
        "COPILOT_GITHUB_TOKEN",
        "openai/gpt-5",
        "openai/o3",
        "openai/o4-mini",
        "models.github.ai",
    ):
        assert forbidden_token not in opencode_text
