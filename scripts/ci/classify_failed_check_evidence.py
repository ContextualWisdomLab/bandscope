#!/usr/bin/env python3
"""Classify failed-check evidence before OpenCode changes PR review state."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


FAILED_CHECK_HEADING = re.compile(r"^## Failed check:\s*(.+)$", re.MULTILINE)
UPLOAD_ARTIFACT_STEP = re.compile(
    r"^- step \d+:\s+Upload .+ artifact \(failure\)$",
    re.IGNORECASE | re.MULTILINE,
)
BUILD_NATIVE_SHELL_STEP = re.compile(
    r"^- step \d+:\s+Build native shell \(failure\)$",
    re.IGNORECASE | re.MULTILINE,
)
SETUP_UV_STEP = re.compile(
    r"^- step \d+:\s+Run astral-sh/setup-uv@.+ \(failure\)$",
    re.IGNORECASE | re.MULTILINE,
)
ARTIFACT_UPLOAD_INFRA_PATTERNS = (
    (
        "artifact upload finalize request reset",
        re.compile(
            r"Failed to FinalizeArtifact:\s+Unable to make request:\s+ECONNRESET",
            re.IGNORECASE,
        ),
    ),
    (
        "artifact service request reset",
        re.compile(r"Unable to make request:\s+ECONNRESET", re.IGNORECASE),
    ),
)
ARTIFACT_UPLOAD_CONFIRMATION_PATTERNS = (
    re.compile(r"actions/upload-artifact@", re.IGNORECASE),
    re.compile(r"Finished uploading artifact content", re.IGNORECASE),
    re.compile(r"Finalizing artifact upload", re.IGNORECASE),
)
TAURI_BINARY_RELEASE_DOWNLOAD_PATTERNS = (
    re.compile(
        r"Downloading https://github\.com/tauri-apps/binary-releases/",
        re.IGNORECASE,
    ),
)
TAURI_BUNDLE_INFRA_PATTERNS = (
    (
        "tauri binary release download server error",
        re.compile(
            r"failed to bundle project `http status:\s*50[0-9]`",
            re.IGNORECASE,
        ),
    ),
)
SETUP_UV_MANIFEST_FETCH_PATTERNS = (
    re.compile(
        r"Fetching manifest data from "
        r"https://raw\.githubusercontent\.com/astral-sh/versions/",
        re.IGNORECASE,
    ),
)
SETUP_UV_INFRA_PATTERNS = (
    (
        "setup-uv manifest fetch failed",
        re.compile(r"##\[error\]fetch failed", re.IGNORECASE),
    ),
)
BUILD_OR_PACKAGE_SUCCESS_PATTERNS = (
    re.compile(r"Finished `release` profile", re.IGNORECASE),
    re.compile(r"Built application at:", re.IGNORECASE),
    re.compile(r"Packaged .+ to artifacts/", re.IGNORECASE),
)


def unknown(reason: str, *, signals: list[str] | None = None) -> dict[str, Any]:
    """Return the default actionable-or-unknown classification."""
    return {
        "classification": "actionable_or_unknown",
        "reason": reason,
        "signals": signals or [],
    }


def external(reason: str, *, signals: list[str]) -> dict[str, Any]:
    """Return a classification for failures outside repository source control."""
    return {
        "classification": "external_infrastructure",
        "reason": reason,
        "signals": signals,
    }


def matching_evidence_lines(
    evidence_text: str, patterns: tuple[re.Pattern[str], ...]
) -> list[str]:
    """Return concrete evidence lines matched by the given patterns."""
    matches: list[str] = []
    for pattern in patterns:
        for line in evidence_text.splitlines():
            if pattern.search(line):
                matches.append(line.strip())
                break
    return matches


def matching_labeled_evidence_lines(
    evidence_text: str, patterns: tuple[tuple[str, re.Pattern[str]], ...]
) -> list[str]:
    """Return labeled concrete evidence lines matched by the given patterns."""
    matches: list[str] = []
    matched_lines: set[str] = set()
    for label, pattern in patterns:
        for line in evidence_text.splitlines():
            if pattern.search(line):
                matched_line = line.strip()
                if matched_line not in matched_lines:
                    matches.append(f"{label}: {matched_line}")
                    matched_lines.add(matched_line)
                break
    return matches


def classify_failed_check_evidence(evidence_text: str) -> dict[str, Any]:
    """Classify whether failed check evidence is safe to withhold as non-source."""
    failed_checks = FAILED_CHECK_HEADING.findall(evidence_text)
    if not failed_checks:
        return unknown("no failed check headings were present")
    if len(failed_checks) != 1:
        return unknown(
            "multiple failed checks require per-check source diagnosis",
            signals=failed_checks,
        )

    failed_check = failed_checks[0].strip()
    upload_step_match = UPLOAD_ARTIFACT_STEP.search(evidence_text)
    build_success_signals = matching_evidence_lines(
        evidence_text,
        BUILD_OR_PACKAGE_SUCCESS_PATTERNS,
    )
    if upload_step_match is not None:
        matched_infra_signals = matching_labeled_evidence_lines(
            evidence_text,
            ARTIFACT_UPLOAD_INFRA_PATTERNS,
        )
        if not matched_infra_signals:
            return unknown(
                "no known external artifact upload infrastructure signal was present",
                signals=[failed_check, upload_step_match.group(0)],
            )

        if not any(
            pattern.search(evidence_text)
            for pattern in ARTIFACT_UPLOAD_CONFIRMATION_PATTERNS
        ):
            return unknown(
                "artifact upload context was missing from the failed-check evidence",
                signals=[
                    failed_check,
                    upload_step_match.group(0),
                    *matched_infra_signals,
                ],
            )

        if not build_success_signals:
            return unknown(
                "build or package success was not visible before artifact upload failed",
                signals=[
                    failed_check,
                    upload_step_match.group(0),
                    *matched_infra_signals,
                ],
            )

        return external(
            (
                "the only failed check is a GitHub artifact upload "
                "finalization/network failure after build/package output was "
                "produced; rerun the failed workflow job instead of requesting "
                "source changes"
            ),
            signals=[
                failed_check,
                upload_step_match.group(0),
                *matched_infra_signals,
                *build_success_signals,
            ],
        )

    setup_uv_step_match = SETUP_UV_STEP.search(evidence_text)
    if setup_uv_step_match is not None:
        matched_infra_signals = matching_labeled_evidence_lines(
            evidence_text,
            SETUP_UV_INFRA_PATTERNS,
        )
        if not matched_infra_signals:
            return unknown(
                "no known external setup-uv infrastructure signal was present",
                signals=[failed_check, setup_uv_step_match.group(0)],
            )

        setup_uv_fetch_signals = matching_evidence_lines(
            evidence_text,
            SETUP_UV_MANIFEST_FETCH_PATTERNS,
        )
        if not setup_uv_fetch_signals:
            return unknown(
                "setup-uv manifest fetch context was missing from the evidence",
                signals=[
                    failed_check,
                    setup_uv_step_match.group(0),
                    *matched_infra_signals,
                ],
            )

        return external(
            (
                "the only failed check is a setup-uv manifest fetch failure "
                "before repository build steps ran; rerun the failed workflow "
                "job instead of requesting source changes"
            ),
            signals=[
                failed_check,
                setup_uv_step_match.group(0),
                *matched_infra_signals,
                *setup_uv_fetch_signals,
            ],
        )

    native_shell_step_match = BUILD_NATIVE_SHELL_STEP.search(evidence_text)
    if native_shell_step_match is None:
        return unknown(
            "no known external failed job step pattern was present",
            signals=[failed_check],
        )

    matched_infra_signals = matching_labeled_evidence_lines(
        evidence_text,
        TAURI_BUNDLE_INFRA_PATTERNS,
    )
    if not matched_infra_signals:
        return unknown(
            "no known external native-shell infrastructure signal was present",
            signals=[failed_check, native_shell_step_match.group(0)],
        )

    tauri_download_signals = matching_evidence_lines(
        evidence_text,
        TAURI_BINARY_RELEASE_DOWNLOAD_PATTERNS,
    )
    if not tauri_download_signals:
        return unknown(
            "Tauri binary release download context was missing from the evidence",
            signals=[
                failed_check,
                native_shell_step_match.group(0),
                *matched_infra_signals,
            ],
        )

    if not build_success_signals:
        return unknown(
            "build success was not visible before native-shell bundling failed",
            signals=[
                failed_check,
                native_shell_step_match.group(0),
                *matched_infra_signals,
                *tauri_download_signals,
            ],
        )

    return external(
        (
            "the only failed check is a Tauri binary release download server "
            "error after the native app binary was built; rerun the failed "
            "workflow job instead of requesting source changes"
        ),
        signals=[
            failed_check,
            native_shell_step_match.group(0),
            *matched_infra_signals,
            *tauri_download_signals,
            *build_success_signals,
        ],
    )


def main(argv: list[str]) -> int:
    """Classify a failed-check evidence file and print JSON."""
    if len(argv) != 2:
        print(
            "usage: classify_failed_check_evidence.py <evidence-file>", file=sys.stderr
        )
        return 64

    evidence_file = Path(argv[1])
    try:
        evidence_text = evidence_file.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"cannot read failed-check evidence file: {exc}", file=sys.stderr)
        return 65

    print(json.dumps(classify_failed_check_evidence(evidence_text), ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
