"""Contracts for the coordinated PDF.js and Undici security baseline."""

from __future__ import annotations

import json
import re
import sys
from copy import deepcopy
from pathlib import Path

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_PDFJS_VERSION = "6.2.108"
_UNDICI_VERSION = "7.29.1"
_PDFJS_INTEGRITY = (
    "sha512-YxFb+SQcodN2rnX9Tn3dHYlqfb7NjlzzfONPpJd+AKoKtUjEdevTfbC07d5Tcczz"
    "OK6261auRkP/M8OBHs9vFQ=="
)
_UNDICI_INTEGRITY = (
    "sha512-RYONW2MeafgYlkVOKYKkA/Ag7BmXqgIWCa8t1m0JcxrQg9pI9lEqRhAOruOBCbA"
    "ohOa/gkCF+iPi9hrgvTzu6Q=="
)


def _read_json(relative_path: str) -> dict[str, object]:
    """Return one repository JSON document as a mapping."""
    document = json.loads((_REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8"))
    assert isinstance(document, dict)
    return document


def test_manifests_pin_the_security_floors_without_semver_drift() -> None:
    """Keep the vulnerable transitive client and PDF parser on exact versions."""
    root_manifest = _read_json("package.json")
    desktop_manifest = _read_json("apps/desktop/package.json")

    assert root_manifest["devDependencies"]["undici"] == _UNDICI_VERSION  # type: ignore[index]
    assert root_manifest["overrides"]["undici"] == "$undici"  # type: ignore[index]
    assert desktop_manifest["dependencies"]["pdfjs-dist"] == _PDFJS_VERSION  # type: ignore[index]


def _stable_version_parts(version: object) -> tuple[int, ...]:
    """Recognize only stable exact x.y.z versions, not arbitrary npm semver."""
    assert isinstance(version, str) and re.fullmatch(
        r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version
    ), "expected stable exact version"
    return tuple(int(part) for part in version.split("."))


def _assert_coherent_vitest_coverage_graph() -> None:
    """Check aligned stable versions under matching positive-major caret requirements."""
    packages = _read_json("package-lock.json").get("packages")
    assert isinstance(packages, dict) and packages, "missing package graph"
    requirements = []
    for workspace in ("apps/desktop", "packages/shared-types"):
        dependencies = _read_json(f"{workspace}/package.json").get("devDependencies")
        assert isinstance(dependencies, dict), "missing workspace devDependencies"
        requirement = dependencies.get("vitest")
        assert requirement == dependencies.get("@vitest/coverage-v8"), "workspace pair drift"
        # Intentionally bounded to the repository's ^x.y.z form; new range syntax
        # requires review, not a partial implementation of general npm semver.
        assert isinstance(requirement, str) and requirement.startswith("^"), (
            "expected stable positive-major caret requirement"
        )
        floor = _stable_version_parts(requirement[1:])
        assert floor[0] > 0, "expected positive-major caret requirement"
        requirements.append(floor)
        locked_workspace = packages.get(workspace)
        assert isinstance(locked_workspace, dict), "missing locked workspace"
        assert locked_workspace.get("devDependencies") == dependencies, "manifest-lock drift"

    vitest_locations = {
        path: metadata
        for path, metadata in packages.items()
        if isinstance(path, str) and path.endswith("node_modules/vitest")
    }
    coverage_locations = {
        path: metadata
        for path, metadata in packages.items()
        if isinstance(path, str) and path.endswith("node_modules/@vitest/coverage-v8")
    }
    assert vitest_locations and coverage_locations, "missing runner or coverage records"
    installed_versions = set()
    for metadata in vitest_locations.values():
        assert isinstance(metadata, dict), "invalid runner record"
        version = metadata.get("version")
        _stable_version_parts(version)
        installed_versions.add(version)
    assert len(installed_versions) == 1, "runner versions drift"
    installed_version = installed_versions.pop()
    installed = _stable_version_parts(installed_version)
    assert all(installed[0] == floor[0] and installed >= floor for floor in requirements), (
        "runner outside workspace requirement"
    )
    for metadata in coverage_locations.values():
        assert isinstance(metadata, dict), "invalid coverage record"
        assert metadata.get("version") == installed_version, "runner-coverage version drift"
        peers = metadata.get("peerDependencies")
        assert isinstance(peers, dict), "missing coverage peers"
        assert peers.get("vitest") == installed_version, "coverage peer must equal runner version"


def test_vitest_coverage_graph_is_coherent() -> None:
    """Check the real graph without permanently pinning the inherited patch."""
    _assert_coherent_vitest_coverage_graph()


# Public JSON-boundary projection of reviewed #1134 metadata, not dependency intent.
# Only locations, versions and coverage peers consumed by this contract are retained.
_REVIEWED_NESTED_RECORDS = """
{
  "apps/desktop/node_modules/vitest": {
    "version": "4.1.11", "peerDependencies": {"@vitest/coverage-v8": "4.1.11"}
  },
  "packages/shared-types/node_modules/vitest": {
    "version": "4.1.11", "peerDependencies": {"@vitest/coverage-v8": "4.1.11"}
  },
  "apps/desktop/node_modules/@vitest/coverage-v8": {
    "version": "4.1.11",
    "peerDependencies": {"@vitest/browser": "4.1.11", "vitest": "4.1.11"}
  },
  "packages/shared-types/node_modules/@vitest/coverage-v8": {
    "version": "4.1.11",
    "peerDependencies": {"@vitest/browser": "4.1.11", "vitest": "4.1.11"}
  }
}
"""


def _fixture_locations(packages: dict[str, object], package_name: str) -> tuple[str, ...]:
    """Inventory every copied runner/provider record with the validator's suffix rule."""
    locations = tuple(
        sorted(
            path
            for path in packages
            if isinstance(path, str) and path.endswith(f"node_modules/{package_name}")
        )
    )
    assert locations, f"missing fixture records for {package_name}"
    return locations


def _set_fixture_versions(packages: dict[str, object], version: object) -> None:
    """Normalize all copied records and Vitest peers, never the real repository graph."""
    for package_name in ("vitest", "@vitest/coverage-v8"):
        for path in _fixture_locations(packages, package_name):
            metadata = packages[path]
            assert isinstance(metadata, dict)
            metadata["version"] = version
            peers = metadata.setdefault("peerDependencies", {})
            assert isinstance(peers, dict)
            if package_name == "@vitest/coverage-v8":
                peers["vitest"] = version
            for name in peers:
                if name == "vitest" or name.startswith("@vitest/"):
                    peers[name] = version


@pytest.fixture(params=["hoisted", "reviewed-nested"])
def vitest_graph(
    monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest
) -> dict[str, dict[str, object]]:
    """Exercise copied public JSON in both layouts without rewriting source files."""
    paths = (
        "package-lock.json",
        "apps/desktop/package.json",
        "packages/shared-types/package.json",
    )
    documents = {path: deepcopy(_read_json(path)) for path in paths}
    # Stabilize only the copied Vitest schema so negative cases remain meaningful
    # after a future real dependency update. The real-graph test stays unpatched.
    packages = documents["package-lock.json"]["packages"]
    assert isinstance(packages, dict)
    installed_records = {
        path: metadata
        for path, metadata in packages.items()
        if path.endswith(("node_modules/vitest", "node_modules/@vitest/coverage-v8"))
    }
    if request.param == "hoisted":
        fixture_records = {
            f"node_modules/{name}": deepcopy(
                next(
                    metadata
                    for path, metadata in installed_records.items()
                    if path.endswith(f"node_modules/{name}")
                )
            )
            for name in ("vitest", "@vitest/coverage-v8")
        }
    else:
        fixture_records = json.loads(_REVIEWED_NESTED_RECORDS)
    for path in installed_records:
        del packages[path]
    packages.update(fixture_records)
    for workspace in ("apps/desktop", "packages/shared-types"):
        for document in (documents[f"{workspace}/package.json"], packages[workspace]):
            dependencies = document["devDependencies"]
            assert isinstance(dependencies, dict)
            for name in ("vitest", "@vitest/coverage-v8"):
                dependencies[name] = "^4.1.10"
    _set_fixture_versions(packages, "4.1.10")
    monkeypatch.setattr(sys.modules[__name__], "_read_json", documents.__getitem__)
    _assert_coherent_vitest_coverage_graph()
    return documents


@pytest.mark.parametrize("requirement", ["^4.1.10", "^4.1.11"])
def test_vitest_graph_accepts_a_coordinated_patch(
    vitest_graph: dict[str, dict[str, object]], requirement: str
) -> None:
    """4.1.11 is hypothetical schema input, not an installed runtime claim."""
    packages = vitest_graph["package-lock.json"]["packages"]
    assert isinstance(packages, dict)
    for workspace in ("apps/desktop", "packages/shared-types"):
        for document in (vitest_graph[f"{workspace}/package.json"], packages[workspace]):
            dependencies = document["devDependencies"]
            assert isinstance(dependencies, dict)
            for name in ("vitest", "@vitest/coverage-v8"):
                dependencies[name] = requirement
    _set_fixture_versions(packages, "4.1.11")
    _assert_coherent_vitest_coverage_graph()


@pytest.mark.parametrize(
    ("path", "value", "message"),
    [
        (("packages",), None, "missing package graph"),
        (("packages",), {}, "missing package graph"),
        (("packages", "apps/desktop"), None, "missing locked workspace"),
        (("packages", "apps/desktop", "devDependencies"), {}, "manifest-lock drift"),
        (("packages", "packages/shared-types", "devDependencies"), None, "manifest-lock drift"),
        (("packages", "node_modules/vitest"), None, "invalid runner record"),
        (("packages", "node_modules/@vitest/coverage-v8"), None, "invalid coverage record"),
        (
            ("packages", "node_modules/@vitest/coverage-v8", "version"),
            "4.1.11",
            "runner-coverage version drift",
        ),
        (
            ("packages", "node_modules/@vitest/coverage-v8", "version"),
            None,
            "runner-coverage version drift",
        ),
        (
            ("packages", "node_modules/@vitest/coverage-v8", "peerDependencies"),
            None,
            "missing coverage peers",
        ),
        *[
            (
                ("packages", "node_modules/@vitest/coverage-v8", "peerDependencies", "vitest"),
                peer,
                "coverage peer must equal runner version",
            )
            for peer in (None, "", "4.1.11", "5.0.0", "^4.1.10")
        ],
    ],
)
def test_vitest_graph_rejects_record_drift(
    vitest_graph: dict[str, dict[str, object]],
    path: tuple[str, ...],
    value: object,
    message: str,
) -> None:
    """Malformed lock records fail at the relevant coherence assertion."""
    record = vitest_graph["package-lock.json"]
    packages = record["packages"]
    assert isinstance(packages, dict)
    if len(path) > 1 and path[1].startswith("node_modules/"):
        package_name = path[1].removeprefix("node_modules/")
        # Mutate the last existing location: nested failures must not rely on the
        # validator inspecting only the first record, nor create an absent root.
        target = _fixture_locations(packages, package_name)[-1]
        path = (path[0], target, *path[2:])
    for key in path[:-1]:
        record = record[key]
        assert isinstance(record, dict)
    record[path[-1]] = value
    with pytest.raises(AssertionError, match=message):
        _assert_coherent_vitest_coverage_graph()


@pytest.mark.parametrize("package_name", ["vitest", "@vitest/coverage-v8"])
def test_vitest_graph_requires_both_installed_packages(
    vitest_graph: dict[str, dict[str, object]], package_name: str
) -> None:
    """A missing runner or coverage provider must not pass vacuous all checks."""
    packages = vitest_graph["package-lock.json"]["packages"]
    assert isinstance(packages, dict)
    for path in list(packages):
        if path.endswith(f"node_modules/{package_name}"):
            del packages[path]
    with pytest.raises(AssertionError, match="missing runner or coverage records"):
        _assert_coherent_vitest_coverage_graph()


@pytest.mark.parametrize("version", ["4.1.9", "5.0.0", "4.1.10-beta.1", "4.01.10", None])
def test_vitest_graph_rejects_versions_outside_workspace_requirements(
    vitest_graph: dict[str, dict[str, object]], version: object
) -> None:
    """Even an aligned pair needs valid versions within the declared major and floor."""
    packages = vitest_graph["package-lock.json"]["packages"]
    assert isinstance(packages, dict)
    _set_fixture_versions(packages, version)
    with pytest.raises(AssertionError, match="stable exact version|outside workspace requirement"):
        _assert_coherent_vitest_coverage_graph()


@pytest.mark.parametrize("requirement", [None, "", "*", "^4.1", "^0.1.10", "^4.1.10 || ^5.0.0"])
def test_vitest_graph_rejects_unsupported_requirements(
    vitest_graph: dict[str, dict[str, object]], requirement: object
) -> None:
    """Reject unsupported npm syntax rather than pretending to parse arbitrary ranges."""
    packages = vitest_graph["package-lock.json"]["packages"]
    assert isinstance(packages, dict)
    for workspace in ("apps/desktop", "packages/shared-types"):
        for document in (vitest_graph[f"{workspace}/package.json"], packages[workspace]):
            for name in ("vitest", "@vitest/coverage-v8"):
                document["devDependencies"][name] = requirement
    with pytest.raises(AssertionError, match="stable.*version|positive-major caret requirement"):
        _assert_coherent_vitest_coverage_graph()


def test_vitest_graph_rejects_workspace_pair_drift(
    vitest_graph: dict[str, dict[str, object]],
) -> None:
    """Matching the lock alone does not permit different runner and coverage requirements."""
    packages = vitest_graph["package-lock.json"]["packages"]
    assert isinstance(packages, dict)
    for document in (vitest_graph["apps/desktop/package.json"], packages["apps/desktop"]):
        document["devDependencies"]["vitest"] = "^5.0.0"
    with pytest.raises(AssertionError, match="workspace pair drift"):
        _assert_coherent_vitest_coverage_graph()


@pytest.mark.parametrize("package_name", ["vitest", "@vitest/coverage-v8"])
def test_vitest_graph_checks_nested_package_versions(
    vitest_graph: dict[str, dict[str, object]], package_name: str
) -> None:
    """Nested installed locations cannot conceal a second mismatched version."""
    packages = vitest_graph["package-lock.json"]["packages"]
    assert isinstance(packages, dict)
    seed = _fixture_locations(packages, package_name)[-1]
    nested = deepcopy(packages[seed])
    assert isinstance(nested, dict)
    nested["version"] = "4.1.11"
    packages[f"{seed}/node_modules/{package_name}"] = nested
    with pytest.raises(AssertionError, match="runner versions drift|runner-coverage version drift"):
        _assert_coherent_vitest_coverage_graph()


def test_lock_records_match_exact_registry_artifacts_and_preserve_peer_metadata() -> None:
    """Require the pinned generator's exact graph without unrelated esbuild churn."""
    lock_document = _read_json("package-lock.json")
    packages = lock_document["packages"]
    assert isinstance(packages, dict)

    root_package = packages[""]
    assert isinstance(root_package, dict)
    assert root_package["devDependencies"]["undici"] == _UNDICI_VERSION  # type: ignore[index]

    desktop = packages["apps/desktop"]
    assert isinstance(desktop, dict)
    assert desktop["dependencies"]["pdfjs-dist"] == _PDFJS_VERSION  # type: ignore[index]

    pdfjs = packages["node_modules/pdfjs-dist"]
    assert isinstance(pdfjs, dict)
    assert pdfjs["version"] == _PDFJS_VERSION
    assert pdfjs["resolved"] == (
        f"https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-{_PDFJS_VERSION}.tgz"
    )
    assert pdfjs["integrity"] == _PDFJS_INTEGRITY
    assert pdfjs["license"] == "Apache-2.0"
    assert pdfjs["engines"] == {"node": ">=22.13.0 || >=24"}

    undici = packages["node_modules/undici"]
    assert isinstance(undici, dict)
    assert undici["version"] == _UNDICI_VERSION
    assert undici["resolved"] == "https://registry.npmjs.org/undici/-/undici-7.29.1.tgz"
    assert undici["integrity"] == _UNDICI_INTEGRITY

    esbuild_locations = {
        path: metadata
        for path, metadata in packages.items()
        if isinstance(path, str) and path.startswith("node_modules/@esbuild/")
    }
    assert esbuild_locations
    assert all(
        isinstance(metadata, dict) and metadata.get("peer") is True
        for metadata in esbuild_locations.values()
    )
