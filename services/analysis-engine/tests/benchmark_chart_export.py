"""Measure chart-export runtime and traced allocation on a realistic song fixture."""

import statistics
import time
import tracemalloc

from bandscope_analysis.exports.chart import build_chart_text, build_cue_sheet_rows


def make_large_song_fixture(
    section_count: int = 96, roles_per_section: int = 24
) -> dict[str, object]:
    """Build a realistic large-song export fixture for benchmarking."""
    song_sections: list[dict[str, object]] = []
    for section_index in range(section_count):
        section_roles: list[dict[str, object]] = []
        part_graph_nodes: list[dict[str, object]] = []
        for role_index in range(roles_per_section):
            role_identifier = f"role_{role_index % 5}"
            section_roles.append(
                {
                    "id": role_identifier,
                    "name": f"Role Name {role_identifier}",
                    "cue": {"value": f"Cue {role_index % 4}"},
                    "rehearsalPriority": f"Priority {role_index % 2}",
                }
            )
            part_graph_nodes.append({"role_id": role_identifier, "is_active": True})

        song_sections.append(
            {
                "label": f"Section {section_index}",
                "timeRange": {
                    "start": section_index * 10,
                    "end": section_index * 10 + 5,
                },
                "roles": section_roles,
                "partGraph": part_graph_nodes,
                "confidence": {"level": "high"},
            }
        )

    return {
        "title": "Benchmark Large Song",
        "bpm": 120,
        "key": "C major",
        "feel": "Straight",
        "sections": song_sections,
        "exportSummary": {"headline": "Benchmark"},
    }


def chart_export_benchmark() -> None:
    """Print runtime and traced peak allocation for repeated chart exports."""
    benchmark_song = make_large_song_fixture()

    for _warmup_iteration in range(100):
        build_chart_text(benchmark_song)
        build_cue_sheet_rows(benchmark_song)

    print("Running Latency Benchmark...")

    # Phase 1: Pure Latency (no tracemalloc overhead)
    benchmark_iteration_count = 1000
    benchmark_sample_durations_seconds: list[float] = []
    for _benchmark_iteration in range(benchmark_iteration_count):
        benchmark_sample_started_at = time.perf_counter()
        build_chart_text(benchmark_song)
        build_cue_sheet_rows(benchmark_song)
        benchmark_sample_finished_at = time.perf_counter()
        benchmark_sample_durations_seconds.append(
            benchmark_sample_finished_at - benchmark_sample_started_at
        )

    print("Running Allocation Benchmark...")
    # Phase 2: Pure Allocation (no timing structures)
    tracemalloc.start()

    allocation_iteration_count = 10
    for _allocation_iteration in range(allocation_iteration_count):
        build_chart_text(benchmark_song)
        build_cue_sheet_rows(benchmark_song)

    _current_allocation_bytes, peak_allocation_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    total_duration_seconds = sum(benchmark_sample_durations_seconds)
    median_duration_seconds = statistics.median(benchmark_sample_durations_seconds)
    p95_duration_seconds = statistics.quantiles(
        benchmark_sample_durations_seconds, n=100, method="inclusive"
    )[94]
    print(f"Total time for {benchmark_iteration_count} iterations: {total_duration_seconds:.4f}s")
    print(
        "Average time per iteration: "
        f"{(total_duration_seconds / benchmark_iteration_count) * 1000:.2f}ms"
    )
    print(f"Median time per sample: {median_duration_seconds * 1000:.2f}ms")
    print(f"P95 time per sample: {p95_duration_seconds * 1000:.2f}ms")
    print(f"Peak memory overhead: {peak_allocation_bytes / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    chart_export_benchmark()
