import time
import tracemalloc
from bandscope_analysis.exports.chart import build_chart_text, build_cue_sheet_rows

def make_large_song_fixture(num_sections=1000, roles_per_section=40):
    """Realistic large-song export fixture for benchmarking."""
    sections = []
    for i in range(num_sections):
        roles = []
        part_graph = []
        for j in range(roles_per_section):
            role_id = f"role_{j % 5}"
            roles.append({
                "id": role_id,
                "name": f"Role Name {role_id}",
                "cue": {"value": f"Cue {j % 4}"},
                "rehearsalPriority": f"Priority {j % 2}"
            })
            part_graph.append({"role_id": role_id, "is_active": True})

        sections.append({
            "label": f"Section {i}",
            "timeRange": {"start": i * 10, "end": i * 10 + 5},
            "roles": roles,
            "partGraph": part_graph,
            "confidence": {"level": "high"}
        })

    return {
        "title": "Benchmark Large Song",
        "bpm": 120,
        "key": "C major",
        "feel": "Straight",
        "sections": sections,
        "exportSummary": {"headline": "Benchmark"}
    }

def run_benchmark():
    song = make_large_song_fixture()

    # Warmup
    for _ in range(2):
        build_chart_text(song)
        build_cue_sheet_rows(song)

    print("Running Benchmark...")
    tracemalloc.start()
    t0 = time.perf_counter()

    iterations = 50
    for _ in range(iterations):
        build_chart_text(song)
        build_cue_sheet_rows(song)

    t1 = time.perf_counter()
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    total_time = t1 - t0
    print(f"Total time for {iterations} iterations: {total_time:.4f}s")
    print(f"Average time per iteration: {(total_time / iterations) * 1000:.2f}ms")
    print(f"Peak memory overhead: {peak / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    run_benchmark()
