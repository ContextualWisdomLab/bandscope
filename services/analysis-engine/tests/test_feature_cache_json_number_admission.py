"""Regression coverage for JSON numeric limits at the feature-cache boundary."""

from pathlib import Path

from bandscope_analysis.feature_cache_admission import read_bounded_feature_cache_metadata


def test_feature_cache_metadata_huge_integer_is_a_cache_miss(tmp_path: Path) -> None:
    """A bounded sidecar with an over-limit JSON integer must not escape as ValueError."""
    metadata_path = tmp_path / "features.json"
    metadata_path.write_text(
        '{"schemaVersion":1,"sampleRate":' + ("9" * 5_000) + "}",
        encoding="utf-8",
    )

    assert read_bounded_feature_cache_metadata(metadata_path) is None
