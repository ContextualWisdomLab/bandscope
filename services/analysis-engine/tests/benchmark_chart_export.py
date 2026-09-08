"""Measure chart-export runtime and traced allocation on a large song fixture."""

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
    import statistics
    benchmark_song = make_large_song_fixture()

    for _warmup_iteration in range(100):
        build_chart_text(benchmark_song)
        build_cue_sheet_rows(benchmark_song)

    print("Running Benchmark...")
    tracemalloc.start()
    benchmark_started_at = time.perf_counter()

    export_timings = []
    benchmark_iteration_count = 1000
    for _benchmark_iteration in range(benchmark_iteration_count):
        iter_started_at = time.perf_counter()
        build_chart_text(benchmark_song)
        build_cue_sheet_rows(benchmark_song)
        export_timings.append(time.perf_counter() - iter_started_at)

    benchmark_finished_at = time.perf_counter()
    _current_allocation_bytes, peak_allocation_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    total_duration_seconds = benchmark_finished_at - benchmark_started_at
    print(f"Total time for {benchmark_iteration_count} iterations: {total_duration_seconds:.4f}s")
    print(
        "Average time per iteration: "
        f"{(total_duration_seconds / benchmark_iteration_count) * 1000:.2f}ms"
    )
    print(f"Median time per iteration: {statistics.median(export_timings) * 1000:.2f}ms")
    print(f"P95 time per iteration: {statistics.quantiles(export_timings, n=100)[94] * 1000:.2f}ms")
    print(f"Peak memory overhead: {peak_allocation_bytes / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    chart_export_benchmark()
