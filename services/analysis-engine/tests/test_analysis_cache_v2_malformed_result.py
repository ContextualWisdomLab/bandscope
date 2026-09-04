"""Regression coverage for malformed current-schema analysis cache entries."""

from bandscope_analysis.api import _load_cached_analysis


def test_current_schema_cache_rejects_non_mapping_result(tmp_path) -> None:
    """Treat an untrusted v2 cache payload with a non-object result as a cache miss."""
    cache_path = tmp_path / "analysis-cache-v2.json"
    cache_path.write_text('{"schemaVersion": 2, "result": []}', encoding="utf-8")

    assert _load_cached_analysis(cache_path) is None
