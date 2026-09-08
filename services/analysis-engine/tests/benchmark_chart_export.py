"""Performance benchmarking script for rehearsal chart text and cue exports."""

import statistics
import time
import tracemalloc

from bandscope_analysis.exports.chart import build_chart_text, build_cue_sheet_rows


def make_large_song_fixture(num_sections_count=96, roles_per_section_count=24):
    """Realistic large-song export fixture for benchmarking."""
    song_sections = []
    for section_index in range(num_sections_count):
        section_roles = []
        part_graph_nodes = []
        for role_index in range(roles_per_section_count):
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
                "timeRange": {"start": section_index * 10, "end": section_index * 10 + 5},
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


def chart_export_benchmark():
    """Execute the large-song performance benchmark and report timing overhead."""
    benchmark_song = make_large_song_fixture()

    # Warmup
    for _warmup_iteration in range(100):
        build_chart_text(benchmark_song)
        build_cue_sheet_rows(benchmark_song)

    print("Running Benchmark...")
    tracemalloc.start()

    benchmark_iteration_count = 1000
    export_timings = []
    total_duration_seconds = 0.0
    for _benchmark_iteration in range(benchmark_iteration_count):
        benchmark_started_at = time.perf_counter()
        build_chart_text(benchmark_song)
        build_cue_sheet_rows(benchmark_song)
        export_timings.append(time.perf_counter() - benchmark_started_at)
        total_duration_seconds += export_timings[-1]

    _current_allocation_bytes, peak_allocation_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    print(f"Total time for {benchmark_iteration_count} iterations: {total_duration_seconds:.4f}s")
    print(f"Median time per iteration: {statistics.median(export_timings) * 1000:.2f}ms")
    print(f"P95 time per iteration: {statistics.quantiles(export_timings, n=100)[94] * 1000:.2f}ms")
    print(f"Peak memory overhead: {peak_allocation_bytes / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    chart_export_benchmark()
