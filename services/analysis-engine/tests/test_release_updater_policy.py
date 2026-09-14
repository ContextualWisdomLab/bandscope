"""Distribution contracts for the BandScope updater release policy."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GUARD_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_updater_policy.py"
_RELEASE_IDENTITY_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_identity.py"


def _load_guard() -> ModuleType:
    """Load the updater policy guard from its executable repository path."""
    assert _GUARD_PATH.is_file(), "release preflight must own an updater policy guard"
    module_spec = importlib.util.spec_from_file_location(
        "verify_release_updater_policy", _GUARD_PATH
    )
    assert module_spec is not None and module_spec.loader is not None
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def _write_fixture(
    repository_root: Path,
    *,
    state: str,
    public_key: str | None,
    endpoints: list[str],
    create_updater_artifacts: bool = False,
    updater_config: dict[str, object] | None = None,
) -> None:
    """Write the minimum policy and Tauri config consumed by the guard."""
    (repository_root / "release").mkdir(parents=True, exist_ok=True)
    tauri_root = repository_root / "apps" / "desktop" / "src-tauri"
    tauri_root.mkdir(parents=True, exist_ok=True)
    (repository_root / "release" / "updater-policy.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "state": state,
                "channel": "stable",
                "minimumSupportedVersion": "0.1.3",
                "publicKey": public_key,
                "endpoints": endpoints,
                "reason": (
                    "External updater signing authority is not provisioned."
                    if state == "blocked"
                    else None
                ),
            }
        ),
        encoding="utf-8",
    )
    tauri_document: dict[str, object] = {
        "bundle": {"active": True, "createUpdaterArtifacts": create_updater_artifacts}
    }
    if updater_config is not None:
        tauri_document["plugins"] = {"updater": updater_config}
    (tauri_root / "tauri.conf.json").write_text(
        json.dumps(tauri_document), encoding="utf-8"
    )


def test_checked_in_updater_policy_is_explicitly_blocked_until_authority_exists() -> None:
    """Keep the repository honest while updater signing/publication authority is absent."""
    guard = _load_guard()

    policy = guard.verify_updater_policy(_REPOSITORY_ROOT, require_admitted=False)

    assert policy["state"] == "blocked"
    assert policy["publicKey"] is None
    assert policy["endpoints"] == []
    with pytest.raises(ValueError, match="commercial updater policy is blocked"):
        guard.verify_updater_policy(_REPOSITORY_ROOT, require_admitted=True)


def test_release_identity_preflight_composes_updater_policy_guard() -> None:
    """Require tag preflight to execute the updater guard rather than a detached audit."""
    preflight_text = _RELEASE_IDENTITY_PATH.read_text(encoding="utf-8")

    assert "verify_release_updater_policy.py" in preflight_text
    assert "verify_updater_policy(" in preflight_text
    assert "require_admitted=release_tag is not None" in preflight_text


def test_admitted_policy_requires_exact_tauri_public_key_and_https_endpoints(
    tmp_path: Path,
) -> None:
    """Bind admitted updater authority to the exact Tauri public key and HTTPS endpoints."""
    guard = _load_guard()
    public_key = "trusted-minisign-public-key"
    endpoints = ["https://releases.example.invalid/bandscope/latest.json"]
    _write_fixture(
        tmp_path,
        state="admitted",
        public_key=public_key,
        endpoints=endpoints,
        create_updater_artifacts=True,
        updater_config={"pubkey": public_key, "endpoints": endpoints},
    )

    policy = guard.verify_updater_policy(tmp_path, require_admitted=True)

    assert policy["state"] == "admitted"

    tauri_path = tmp_path / "apps" / "desktop" / "src-tauri" / "tauri.conf.json"
    tauri_document = json.loads(tauri_path.read_text(encoding="utf-8"))
    tauri_document["plugins"]["updater"]["pubkey"] = "wrong-key"
    tauri_path.write_text(json.dumps(tauri_document), encoding="utf-8")
    with pytest.raises(ValueError, match="public key does not match"):
        guard.verify_updater_policy(tmp_path, require_admitted=True)


def test_admitted_policy_rejects_insecure_or_unapproved_endpoint(tmp_path: Path) -> None:
    """Do not admit HTTP transport or endpoint drift outside the release authority."""
    guard = _load_guard()
    public_key = "trusted-minisign-public-key"
    endpoints = ["http://releases.example.invalid/bandscope/latest.json"]
    _write_fixture(
        tmp_path,
        state="admitted",
        public_key=public_key,
        endpoints=endpoints,
        create_updater_artifacts=True,
        updater_config={"pubkey": public_key, "endpoints": endpoints},
    )
    with pytest.raises(ValueError, match="HTTPS"):
        guard.verify_updater_policy(tmp_path, require_admitted=True)

    endpoints = ["https://releases.example.invalid/bandscope/latest.json"]
    _write_fixture(
        tmp_path,
        state="admitted",
        public_key=public_key,
        endpoints=endpoints,
        create_updater_artifacts=True,
        updater_config={
            "pubkey": public_key,
            "endpoints": ["https://mirror.example.invalid/latest.json"],
        },
    )
    with pytest.raises(ValueError, match="endpoints do not match"):
        guard.verify_updater_policy(tmp_path, require_admitted=True)


def test_admitted_policy_requires_updater_artifacts_and_safe_transport(
    tmp_path: Path,
) -> None:
    """Require signed updater artifacts and reject Tauri insecure-transport escape hatches."""
    guard = _load_guard()
    public_key = "trusted-minisign-public-key"
    endpoints = ["https://releases.example.invalid/bandscope/latest.json"]
    _write_fixture(
        tmp_path,
        state="admitted",
        public_key=public_key,
        endpoints=endpoints,
        create_updater_artifacts=False,
        updater_config={"pubkey": public_key, "endpoints": endpoints},
    )
    with pytest.raises(ValueError, match="createUpdaterArtifacts"):
        guard.verify_updater_policy(tmp_path, require_admitted=True)

    _write_fixture(
        tmp_path,
        state="admitted",
        public_key=public_key,
        endpoints=endpoints,
        create_updater_artifacts=True,
        updater_config={
            "pubkey": public_key,
            "endpoints": endpoints,
            "dangerousInsecureTransportProtocol": True,
        },
    )
    with pytest.raises(ValueError, match="insecure transport"):
        guard.verify_updater_policy(tmp_path, require_admitted=True)


def test_blocked_policy_cannot_hide_partially_enabled_updater(tmp_path: Path) -> None:
    """Reject a blocked authority record when runtime updater capability is already enabled."""
    guard = _load_guard()
    _write_fixture(
        tmp_path,
        state="blocked",
        public_key=None,
        endpoints=[],
        create_updater_artifacts=True,
    )

    with pytest.raises(ValueError, match="blocked updater policy cannot enable"):
        guard.verify_updater_policy(tmp_path, require_admitted=False)


def test_policy_rejects_duplicate_json_members(tmp_path: Path) -> None:
    """Fail closed when duplicate policy members could create parser-dependent authority."""
    guard = _load_guard()
    _write_fixture(
        tmp_path,
        state="blocked",
        public_key=None,
        endpoints=[],
    )
    policy_path = tmp_path / "release" / "updater-policy.json"
    policy_path.write_text(
        '{"schemaVersion":1,"state":"blocked","state":"admitted",'
        '"channel":"stable","minimumSupportedVersion":"0.1.3",'
        '"publicKey":null,"endpoints":[],"reason":"blocked"}',
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="duplicate JSON member"):
        guard.verify_updater_policy(tmp_path, require_admitted=False)
