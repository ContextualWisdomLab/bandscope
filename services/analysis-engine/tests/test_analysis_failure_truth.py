"""Exact #828 real API regression witnesses; native/media seams synthetic only."""

import json
import queue
from copy import deepcopy
from types import SimpleNamespace

import numpy as np
import pytest

import bandscope_analysis.api as api
from bandscope_analysis.separation.audio_separator import (
    _MODEL_ARTIFACTS,
    AudioStemSeparator,
    _read_verified_model_artifact,
)


class NativeQueue(queue.Queue):
    def close(self):
        self.closed = True

    def join_thread(self):
        self.joined = True


class NativeProcess:
    def __init__(self, target, args, mode, trace):
        self.target, self.args, self.mode, self.trace = target, args, mode, trace
        self.alive = False

    def start(self):
        self.trace.append("start")
        if self.mode == "start_error":
            raise OSError("synthetic native start failure")
        if self.mode in ("exit_without_result", "timeout"):
            self.alive = self.mode == "timeout"
            return
        if self.mode == "invalid_metadata":
            self.args[1].put(("ok_file", "not-a-dict"))
            return
        if self.mode == "invalid_arrays":
            self.args[1].put(
                (
                    "ok_file",
                    {
                        "arraysPath": self.args[2],
                        "sampleRate": 22050,
                        "separation": {},
                        "stemKeys": ["bass"],
                    },
                )
            )
            return
        self.target(*self.args)

    def is_alive(self):
        return self.alive

    def join(self, timeout=None):
        self.trace.append("join")

    def terminate(self):
        self.trace.append("terminate")
        self.alive = False

    def kill(self):
        self.trace.append("kill")
        self.alive = False


@pytest.fixture
def boundary(monkeypatch, tmp_path):
    media = tmp_path / "fixture.wav"
    media.write_bytes(b"unit-boundary-not-decoded-audio")
    payload = {
        "sourceKind": "local_audio",
        "projectId": "unit-source",
        "sourceLabel": "fixture.wav",
        "roleFocus": [],
        "localSource": {
            "sourcePath": str(media),
            "fileName": media.name,
            "extension": "wav",
            "fileSizeBytes": media.stat().st_size,
        },
        "cacheRoot": str(tmp_path / "cache"),
        "tempRoot": str(tmp_path / "owned-temp"),
    }
    trace = []
    writes = []
    builds = []
    native = {"mode": "worker", "failure": "runtime"}
    monkeypatch.setattr(
        AudioStemSeparator, "_load_audio", lambda self, p: (np.zeros(32, dtype=np.float32), 22050)
    )

    def signal(self, audio, sr):
        trace.append("separate_signal")
        f = native["failure"]
        if f == "runtime":
            raise RuntimeError("synthetic inference failure")
        if f == "model_missing":
            _read_verified_model_artifact(tmp_path / "absent-model", _MODEL_ARTIFACTS["htdemucs"])
        if f == "model_bad_size":
            bad = tmp_path / "invalid-model"
            bad.write_bytes(b"invalid")
            _read_verified_model_artifact(bad, _MODEL_ARTIFACTS["htdemucs"])
        if f == "dependency":
            raise ValueError("demucs/torch not available on this platform")
        if f == "value":
            raise ValueError("synthetic rejected media")
        if f == "unexpected":
            raise TypeError("synthetic inference unexpected failure")
        if f == "empty_stems":
            return {}
        raise AssertionError(f)

    monkeypatch.setattr(AudioStemSeparator, "_separate_signal", signal)

    def context():
        return SimpleNamespace(
            Queue=lambda maxsize: NativeQueue(maxsize),
            Process=lambda target, args: NativeProcess(target, args, native["mode"], trace),
        )

    monkeypatch.setattr(api, "_multiprocessing_context", context)
    original_builder = api.build_demo_rehearsal_song

    def builder(features=None):
        builds.append(features)
        return original_builder(features)

    monkeypatch.setattr(api, "build_demo_rehearsal_song", builder)
    for name in ("_store_cached_analysis", "_store_cached_local_audio_features"):
        original = getattr(api, name)

        def wrapper(*args, _original=original, _name=name, **kwargs):
            writes.append(_name)
            return _original(*args, **kwargs)

        monkeypatch.setattr(api, name, wrapper)
    return SimpleNamespace(
        payload=payload,
        trace=trace,
        writes=writes,
        builds=builds,
        native=native,
        media=media,
        root=tmp_path,
    )


def observe_and_require_failed(label, boundary, updates=None, escaped=None):
    files = sorted(
        str(p.relative_to(boundary.root))
        for p in (boundary.root / "cache").rglob("*")
        if p.is_file()
    )
    terminal = updates[-1] if updates else None
    data = {
        "case": label,
        "terminal": terminal,
        "escaped": escaped,
        "trace": boundary.trace.copy(),
        "builderCalls": len(boundary.builds),
        "cacheWrites": boundary.writes.copy(),
        "cacheFiles": files,
    }
    violations = []
    if escaped:
        violations.append("native failure escaped structured status")
    if terminal is None or terminal["state"] != "failed":
        violations.append("terminal must be failed")
    if updates and any("result" in u for u in updates):
        violations.append("no rehearsal result")
    if boundary.builds:
        violations.append("demo builder must not run")
    if boundary.writes or files:
        violations.append("no result/feature cache writes")
    assert not violations, json.dumps({"violations": violations, "observed": data})


@pytest.mark.parametrize(
    "failure",
    [
        "runtime",
        "model_missing",
        "model_bad_size",
        "dependency",
        "value",
        "unexpected",
        "source_missing",
    ],
)
def test_local_separation_failure_is_failed_without_demo_or_cache(boundary, failure):
    boundary.native["failure"] = failure
    if failure == "source_missing":
        boundary.media.unlink()
    updates = api.run_analysis_job_updates("job-failure", boundary.payload, "2026-10-05T01:00:00Z")
    observe_and_require_failed(failure, boundary, updates)


@pytest.mark.parametrize(
    "mode", ["exit_without_result", "timeout", "start_error", "invalid_metadata", "invalid_arrays"]
)
def test_native_failure_is_failed_without_demo_or_cache(boundary, monkeypatch, mode):
    boundary.native["mode"] = mode
    if mode == "timeout":
        clock = iter([0.0, 21.0])
        monkeypatch.setattr(api.time, "monotonic", lambda: next(clock))
    updates = None
    escaped = None
    try:
        updates = api.run_analysis_job_updates(
            "job-native", boundary.payload, "2026-10-05T01:00:00Z"
        )
    except Exception as error:
        escaped = type(error).__name__
    observe_and_require_failed(mode, boundary, updates, escaped)


@pytest.mark.parametrize("entrypoint", ["updates", "terminal"])
def test_retry_cannot_replay_success_created_by_failed_separation(boundary, entrypoint):
    first = api.run_analysis_job_updates("job-first", boundary.payload, "2026-10-05T01:00:00Z")
    before = boundary.trace.count("start")
    second = (
        api.run_analysis_job_updates("job-retry", boundary.payload, "2026-10-05T01:01:00Z")
        if entrypoint == "updates"
        else [api.run_analysis_job("job-retry", boundary.payload, "2026-10-05T01:01:00Z")]
    )
    assert first[-1]["state"] == "failed"
    assert boundary.trace.count("start") - before == 1
    observe_and_require_failed("retry-" + entrypoint, boundary, second)


def test_failure_sibling_invalid_request_has_no_result_or_cache(boundary):
    payload = {**boundary.payload, "unexpected": True}
    updates = api.run_analysis_job_updates("job-invalid", payload, "2026-10-05T01:00:00Z")
    observe_and_require_failed("invalid-request", boundary, updates)


def test_legacy_demo_result_cache_is_not_local_success(boundary):
    path = api._analysis_cache_path(boundary.payload)
    assert path is not None
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps({"schemaVersion": 1, "source": {}, "result": api.build_demo_rehearsal_song()})
    )
    boundary.builds.clear()
    updates = api.run_analysis_job_updates("legacy", boundary.payload, "2026-10-05T01:00:00Z")
    assert updates[-1]["state"] == "failed"
    assert not any("result" in update for update in updates)
    assert boundary.trace.count("start") == 1
    assert boundary.writes == []


def test_native_start_failure_closes_queue_without_joining_unstarted(monkeypatch):
    q = NativeQueue(1)
    trace = []

    class UnstartedProcess(NativeProcess):
        def is_alive(self):
            raise AssertionError("cannot inspect an unstarted process")

        def join(self, timeout=None):
            raise AssertionError("cannot join an unstarted process")

    process = UnstartedProcess(None, (), "start_error", trace)
    monkeypatch.setattr(
        api,
        "_multiprocessing_context",
        lambda: SimpleNamespace(Queue=lambda maxsize: q, Process=lambda **kwargs: process),
    )
    with pytest.raises(OSError):
        api._run_stem_separation_with_timeout("private-source")
    assert getattr(q, "closed", False)
    assert getattr(q, "joined", False)
    assert trace == ["start"]


def synthetic_features():
    return {
        "stems": {"bass": np.sin(np.arange(1024) * 0.1).astype(np.float32)},
        "sr": 22050,
        "stem_role_types": {"bass": "instrument"},
        "separation": {"duration_seconds": 1.0, "chunk_count": 1, "notes": "synthetic"},
    }


@pytest.mark.parametrize(
    "bad",
    [
        None,
        {},
        {"stems": {}},
        "not-features",
        {"stems": {"bass": np.zeros(0)}, "sr": 22050, "separation": {"duration_seconds": 1}},
        {
            "stems": {"bass": np.ones(4), "other": np.array([np.nan])},
            "sr": 22050,
            "separation": {"duration_seconds": 1},
        },
        {
            "stems": {"bass": np.ones(4), "other": np.ones((2, 2))},
            "sr": 22050,
            "separation": {"duration_seconds": 1},
        },
        {"stems": {"bass": np.ones(4)}, "sr": True, "separation": {"duration_seconds": 1}},
        {"stems": {"bass": np.ones(4)}, "sr": 22050, "separation": {}},
        {
            "stems": {"bass": np.ones(4)},
            "sr": 22050,
            "separation": {"duration_seconds": float("inf")},
        },
    ],
)
def test_local_invalid_features_never_build_or_write(boundary, monkeypatch, bad):
    monkeypatch.setattr(api, "_build_local_audio_features", lambda request: bad)
    updates = api.run_analysis_job_updates("bad-features", boundary.payload, "timestamp")
    observe_and_require_failed("bad-features", boundary, updates)
    assert updates[-1]["error"] == {
        "code": "engine_unavailable",
        "message": "Stem separation failed",
    }


def test_pipeline_no_sections_never_uses_arrangement(boundary, monkeypatch):
    monkeypatch.setattr(api, "_build_local_audio_features", lambda request: synthetic_features())
    monkeypatch.setattr(api, "segment_with_boundaries", lambda *args: ([], []))
    updates = api.run_analysis_job_updates("empty-analysis", boundary.payload, "timestamp")
    assert updates[-1]["state"] == "failed"
    assert not any("result" in update for update in updates)
    assert boundary.builds == [] and boundary.writes == []


def test_current_real_pipeline_success_is_cached_not_arrangement(boundary, monkeypatch):
    calls = []

    def separate(request):
        calls.append(request)
        return synthetic_features()

    monkeypatch.setattr(api, "_build_local_audio_features", separate)
    monkeypatch.setattr(
        "bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", lambda *args: None
    )
    monkeypatch.setattr(
        "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize", lambda *args: []
    )
    first = api.run_analysis_job_updates("success", boundary.payload, "timestamp")[-1]
    assert first["state"] == "succeeded" and first["cacheStatus"] == "stored"
    assert first["result"]["id"] == "analyzed-song"
    assert first["result"]["title"] != "Late Night Set"
    assert boundary.builds == []
    second = api.run_analysis_job("hit", boundary.payload, "timestamp")
    assert second["state"] == "succeeded" and second["cacheStatus"] == "hit"
    assert second["result"] == first["result"]
    assert len(calls) == 1


def test_current_schema_demo_cache_still_rejected(boundary):
    path = api._analysis_cache_path(boundary.payload)
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps(
            {
                "schemaVersion": api.ANALYSIS_CACHE_SCHEMA_VERSION,
                "jobTruth": "local-pipeline-v2",
                "source": {
                    key: boundary.payload["localSource"][key]
                    for key in ("fileName", "extension", "fileSizeBytes")
                },
                "result": api.build_demo_rehearsal_song(),
            }
        )
    )
    boundary.builds.clear()
    result = api.run_analysis_job("not-demo-hit", boundary.payload, "timestamp")
    assert result["state"] == "failed" and result.get("cacheStatus") != "hit"
    assert boundary.trace.count("start") == 1


@pytest.mark.parametrize("progress", [False, True])
def test_real_cli_transports_local_failure_without_fake_ready(boundary, monkeypatch, progress):
    import io

    from bandscope_analysis import cli

    monkeypatch.setattr(
        cli, "TemporalAnalyzer", lambda: SimpleNamespace(analyze=lambda path: {"bpm": 120})
    )
    stdin = io.StringIO(json.dumps({"jobId": "cli-failure", "request": boundary.payload}))
    stdout = io.StringIO()
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli"] + (["--progress-jsonl"] if progress else []))
    assert cli.main() == 0  # Transport success is distinct from job failure.
    updates = [json.loads(line) for line in stdout.getvalue().splitlines()]
    observe_and_require_failed("cli-failure", boundary, updates)


def _harmless_spawn_worker(mode, result_queue, ready):
    """Only signal startup/sleep/exit; never read media or invoke native ML."""
    import time

    ready.set()
    if mode == "timeout":
        time.sleep(10)


@pytest.mark.parametrize("mode", ["timeout", "no_result"])
def test_actual_light_native_child_exits_after_helper(monkeypatch, mode, record_property):
    import multiprocessing as mp

    context = mp.get_context("spawn")
    ready = context.Event()
    processes = []
    queues = []

    class ReadyProcess:
        def __init__(self, process):
            self.process = process

        def start(self):
            self.process.start()
            if not ready.wait(timeout=5):
                self.process.terminate()
                self.process.join(timeout=1)
                raise AssertionError("spawn worker startup exceeded 5s")

        def __getattr__(self, name):
            return getattr(self.process, name)

    def make_process(**kwargs):
        kwargs["args"] = (mode, kwargs["args"][1], ready)
        process = context.Process(**kwargs)
        processes.append(process)
        return ReadyProcess(process)

    def make_queue(maxsize):
        q = context.Queue(maxsize=maxsize)
        queues.append(q)
        return q

    monkeypatch.setattr(api, "_stem_separation_worker", _harmless_spawn_worker)
    monkeypatch.setattr(
        api,
        "_multiprocessing_context",
        lambda: SimpleNamespace(Process=make_process, Queue=make_queue),
    )
    try:
        expected = api.StemSeparationTimedOut if mode == "timeout" else RuntimeError
        message = "exceeded" if mode == "timeout" else "ended without a result"
        # Startup is bounded separately; no-result gets time to exit, not the alive deadline.
        budget = 0.15 if mode == "timeout" else 5.0
        with pytest.raises(expected, match=message):
            api._run_stem_separation_with_timeout("not-read", timeout_seconds=budget)
        process = processes[0]
        assert ready.is_set()
        assert not process.is_alive()
        if mode == "no_result":
            assert process.exitcode == 0
        else:
            assert process.exitcode is not None and process.exitcode != 0
        assert process.pid not in [p.pid for p in mp.active_children()]
        assert queues[0]._closed
        record_property(
            "actual_spawn_child",
            json.dumps(
                {
                    "mode": mode,
                    "pid": process.pid,
                    "exitcode": process.exitcode,
                    "alive": False,
                    "queueClosed": True,
                    "startMethod": "spawn",
                }
            ),
        )
    finally:
        # Safety cleanup even if a witness assertion fails; assertions above prove helper cleanup.
        for process in processes:
            if process.is_alive():
                process.terminate()
                process.join(timeout=1)
            if process.is_alive():
                process.kill()
                process.join(timeout=1)


def test_private_error_detail_not_in_logs_or_status(boundary, monkeypatch, caplog):
    def failure(request):
        raise RuntimeError("private /secret/customer.wav TOKEN=hidden")

    monkeypatch.setattr(api, "_build_local_audio_features", failure)
    result = api.run_analysis_job("privacy", boundary.payload, "timestamp")
    assert result["state"] == "failed"
    assert "/secret" not in caplog.text + json.dumps(result)
    assert "TOKEN" not in caplog.text + json.dumps(result)


def test_demo_helper_retains_no_sections_arrangement_control(monkeypatch):
    monkeypatch.setattr(
        "bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", lambda *args: None
    )
    monkeypatch.setattr(
        "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize", lambda *args: []
    )
    monkeypatch.setattr(api, "segment_with_boundaries", lambda *args: ([], []))
    assert api.build_demo_rehearsal_song(synthetic_features())["id"] == "demo-song"


@pytest.mark.parametrize(
    "raw", [[], "ok", None, {"sample_rate": 22050}, {"stems": {}, "sr": 22050}]
)
def test_raw_separator_malformed_envelope_fails_structured(boundary, monkeypatch, raw):
    monkeypatch.setattr(api, "_run_stem_separation_with_timeout", lambda *args, **kwargs: raw)
    updates = api.run_analysis_job_updates("raw-invalid", boundary.payload, "timestamp")
    observe_and_require_failed("raw-invalid", boundary, updates)


def test_current_cache_demo_with_renamed_id_is_not_truth(boundary):
    result = api.build_demo_rehearsal_song()
    result["id"] = "analyzed-song"
    path = api._analysis_cache_path(boundary.payload)
    path.parent.mkdir(parents=True)
    source = {
        key: boundary.payload["localSource"][key]
        for key in ("fileName", "extension", "fileSizeBytes")
    }
    path.write_text(
        json.dumps(
            {
                "schemaVersion": api.ANALYSIS_CACHE_SCHEMA_VERSION,
                "jobTruth": "local-pipeline-v2",
                "source": source,
                "result": result,
            }
        )
    )
    boundary.builds.clear()
    assert api.run_analysis_job("renamed-demo", boundary.payload, "timestamp")["state"] == "failed"


def test_worker_file_handoff_to_real_pipeline_and_cache(boundary, monkeypatch):
    features = synthetic_features()
    monkeypatch.setattr(
        AudioStemSeparator,
        "_separate_signal",
        lambda self, audio, sr: {
            name: features["stems"]["bass"] for name in ("vocals", "bass", "drums", "other")
        },
    )
    monkeypatch.setattr(
        "bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", lambda *args: None
    )
    monkeypatch.setattr(
        "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize", lambda *args: []
    )
    first = api.run_analysis_job("worker-success", boundary.payload, "timestamp")
    assert first["state"] == "succeeded"
    assert first["result"]["id"] == "analyzed-song"
    assert first["cacheStatus"] == "stored"
    assert boundary.builds == []
    second = api.run_analysis_job("worker-hit", boundary.payload, "timestamp")
    assert second["state"] == "succeeded" and second["cacheStatus"] == "hit"
    assert second["result"] == first["result"]
    assert boundary.trace.count("start") == 1


def test_unit_demo_builder_control_is_real_and_has_no_native_or_cache(boundary):
    song = api.build_demo_rehearsal_song()
    assert song["id"] == "demo-song" and song["sections"]
    assert boundary.trace == [] and boundary.writes == []


def test_failure_observers_do_not_overwrite_shared_receipt_concurrently(monkeypatch, tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    sentinel = tmp_path / "observations.json"
    sentinel.write_text("concurrency sentinel", encoding="utf-8")
    # On the old witness this redirects its unsafe global write into a pytest-owned path.
    import sys

    monkeypatch.setattr(sys.modules[__name__], "RECEIPT", sentinel, raising=False)

    def require_failure(index):
        private = tmp_path / str(index)
        private.mkdir()
        isolated = SimpleNamespace(root=private, trace=[], builds=[], writes=[])
        observe_and_require_failed(str(index), isolated, [{"state": "failed"}])

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(require_failure, range(2)))
    assert sentinel.read_text(encoding="utf-8") == "concurrency sentinel"


@pytest.mark.parametrize(
    "stem", [np.array([], dtype=np.float32), np.array([np.nan]), np.ones((2, 2))]
)
def test_cached_bad_nonfirst_stem_is_miss_without_changing_loader(boundary, monkeypatch, stem):
    features = synthetic_features()
    features["stems"]["other"] = stem
    features["stem_role_types"]["other"] = "instrument"
    metadata, arrays = api._feature_cache_paths(boundary.payload)
    # Owner writer/reader may accept old shapes: the orchestration consumer must not.
    assert api._store_cached_local_audio_features(metadata, arrays, boundary.payload, features)
    assert api._load_cached_local_audio_features(metadata, arrays) is not None
    boundary.writes.clear()
    result = api.run_analysis_job("bad-cached-stem", boundary.payload, "timestamp")
    assert result["state"] == "failed" and "result" not in result
    assert boundary.trace.count("start") == 1
    assert boundary.writes == [] and boundary.builds == []


@pytest.mark.parametrize(
    "duration,accepted",
    [
        (10**100, False),
        (-(10**100), False),
        (float("nan"), False),
        (float("inf"), False),
        (float("-inf"), False),
        (True, False),
        (False, False),
        (0, False),
        (-1, False),
        (1800.01, False),
        (1, True),
        (0.25, True),
        (1800, True),
        (1800.0, True),
    ],
)
def test_cached_duration_consumer_guard(boundary, monkeypatch, duration, accepted):
    features = synthetic_features()
    features["separation"]["duration_seconds"] = duration
    paths = api._feature_cache_paths(boundary.payload)
    assert api._store_cached_local_audio_features(*paths, boundary.payload, features)
    assert api._load_cached_local_audio_features(*paths) is not None
    boundary.writes.clear()
    monkeypatch.setattr(
        "bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", lambda *args: None
    )
    monkeypatch.setattr(
        "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize", lambda *args: []
    )
    monkeypatch.setattr(
        api,
        "segment_with_boundaries",
        lambda *args: (
            [
                {
                    "id": "synthetic-section",
                    "form_label": "verse",
                    "groove": "straight",
                    "confidence_level": "low",
                    "confidence_source": "model",
                    "confidence_notes": "synthetic segmentation",
                }
            ],
            [(0.0, 1.0)],
        ),
    )
    result = api.run_analysis_job("duration-consumer", boundary.payload, "timestamp")
    assert (result["state"] == "succeeded") is accepted
    assert boundary.trace.count("start") == (0 if accepted else 1)
    assert boundary.builds == []
    if not accepted:
        assert "result" not in result and boundary.writes == []


@pytest.mark.parametrize("loader", ["_load_cached_analysis", "_load_cached_local_audio_features"])
@pytest.mark.parametrize("error", [OSError, UnicodeError, ValueError, RuntimeError, RecursionError])
def test_known_cache_loader_error_is_structured_fail_closed(boundary, monkeypatch, loader, error):
    def fail(*args):
        raise error("private /secret/customer.wav")

    monkeypatch.setattr(api, loader, fail)
    result = api.run_analysis_job("loader-failure", boundary.payload, "timestamp")
    assert result["state"] == "failed" and "result" not in result
    assert result["error"]["code"] == "engine_unavailable"
    assert "/secret" not in json.dumps(result)
    assert boundary.builds == [] and boundary.writes == [] and boundary.trace == []


@pytest.mark.parametrize("bad_result", [None, {}, {"id": "analyzed-song", "sections": []}])
def test_invalid_cached_result_is_miss_and_recomputed(boundary, monkeypatch, bad_result):
    path = api._analysis_cache_path(boundary.payload)
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps({"schemaVersion": api.ANALYSIS_CACHE_SCHEMA_VERSION, "result": bad_result})
    )
    result = api.run_analysis_job("invalid-cache", boundary.payload, "timestamp")
    assert result["state"] == "failed" and "result" not in result
    assert boundary.trace.count("start") == 1 and boundary.writes == []


def test_process_construction_failure_closes_owned_queue(monkeypatch):
    q = NativeQueue(1)

    def fail_process(**kwargs):
        raise OSError("private process factory failure")

    monkeypatch.setattr(
        api,
        "_multiprocessing_context",
        lambda: SimpleNamespace(
            Queue=lambda maxsize: q,
            Process=fail_process,
        ),
    )
    with pytest.raises(OSError):
        api._run_stem_separation_with_timeout("not-read")
    assert getattr(q, "closed", False) and getattr(q, "joined", False)


@pytest.mark.parametrize("error", [OSError, ValueError, RuntimeError, TypeError, KeyError])
def test_pipeline_known_error_does_not_publish_cache(boundary, monkeypatch, error):
    monkeypatch.setattr(api, "_build_local_audio_features", lambda request: synthetic_features())

    def fail(*args):
        raise error("private /secret/inference")

    monkeypatch.setattr(api, "segment_with_boundaries", fail)
    result = api.run_analysis_job("pipeline-error", boundary.payload, "timestamp")
    assert result["state"] == "failed" and "result" not in result
    assert boundary.builds == [] and boundary.writes == []
    assert "/secret" not in json.dumps(result)


@pytest.mark.parametrize(
    "invalid_field", ["roles", "partGraph", "timeRange", "confidence", "exportSummary"]
)
def test_invalid_cached_pipeline_shape_is_not_accepted(boundary, invalid_field):
    result = {
        "id": "analyzed-song",
        "title": "synthetic",
        "sections": [
            {
                "id": "s",
                "label": "verse",
                "groove": "straight",
                "timeRange": {"start": 0, "end": 1},
                "confidence": {"level": "low", "source": "model", "notes": "synthetic"},
                "roles": [],
                "partGraph": [],
            }
        ],
        "exportSummary": {
            "format": "cue-sheet",
            "headline": "synthetic",
            "focusSections": ["verse"],
        },
    }
    if invalid_field == "exportSummary":
        result[invalid_field] = None
    else:
        result["sections"][0][invalid_field] = None
    path = api._analysis_cache_path(boundary.payload)
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps({"schemaVersion": api.ANALYSIS_CACHE_SCHEMA_VERSION, "result": result})
    )
    terminal = api.run_analysis_job("invalid-shape", boundary.payload, "timestamp")
    assert terminal["state"] == "failed" and "result" not in terminal
    assert boundary.trace.count("start") == 1 and boundary.writes == []


def test_bad_cached_features_refetches_then_publishes_true_pipeline(boundary, monkeypatch):
    features = synthetic_features()
    paths = api._feature_cache_paths(boundary.payload)
    bad = {**features, "separation": {"duration_seconds": 0}}
    assert api._store_cached_local_audio_features(*paths, boundary.payload, bad)
    boundary.writes.clear()
    refetched = []

    def refetch(request):
        refetched.append(request)
        return features

    monkeypatch.setattr(api, "_build_local_audio_features", refetch)
    monkeypatch.setattr(
        "bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", lambda *args: None
    )
    monkeypatch.setattr(
        "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize", lambda *args: []
    )
    result = api.run_analysis_job("bad-feature-refetch", boundary.payload, "timestamp")
    assert result["state"] == "succeeded" and result["result"]["id"] == "analyzed-song"
    assert len(refetched) == 1 and boundary.builds == []
    assert boundary.writes == ["_store_cached_local_audio_features", "_store_cached_analysis"]
    replay = api.run_analysis_job("refetched-hit", boundary.payload, "timestamp")
    assert replay["cacheStatus"] == "hit" and len(refetched) == 1


def test_pipeline_empty_mix_never_arranges_or_writes(boundary, monkeypatch):
    monkeypatch.setattr(api, "_build_local_audio_features", lambda request: synthetic_features())
    monkeypatch.setattr(api, "_reconstruct_mix", lambda stems: np.zeros(0))
    arrangements = []
    monkeypatch.setattr(api, "_build_from_arrangement", lambda *args: arrangements.append(args))
    result = api.run_analysis_job("empty-mix", boundary.payload, "timestamp")
    assert result["state"] == "failed" and "result" not in result
    assert arrangements == [] and boundary.writes == [] and boundary.builds == []


@pytest.mark.parametrize("feature_cache", [False, True])
def test_actual_invalid_utf8_cache_fails_structured_without_mutating_reader(
    boundary, feature_cache
):
    path = (
        api._feature_cache_paths(boundary.payload)[0]
        if feature_cache
        else api._analysis_cache_path(boundary.payload)
    )
    path.parent.mkdir(parents=True)
    path.write_bytes(b"\xff")
    result = api.run_analysis_job("invalid-cache-text", boundary.payload, "timestamp")
    assert result["state"] == "failed" and "result" not in result
    assert boundary.trace == [] and boundary.writes == [] and boundary.builds == []


def unsigned_features(dtype, nonfirst):
    features = synthetic_features()
    values = (np.arange(1024) % 7 + 1).astype(dtype)
    values[-1] = np.iinfo(dtype).max
    if nonfirst:
        features["stems"]["other"] = values
        features["stem_role_types"]["other"] = "instrument"
    else:
        features["stems"]["bass"] = values
    return features


def synthetic_pitch_chord_seams(monkeypatch):
    """Keep builder, segmentation, mix, activity and topology real; skip native ML."""
    monkeypatch.setattr(
        "bandscope_analysis.ranges.pitch_tracker.PitchTracker.track",
        lambda *args, **kwargs: {"lowest_note": "C2", "highest_note": "C3"},
    )
    monkeypatch.setattr(
        "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
        lambda *args, **kwargs: [{"chord": "C"}],
    )


@pytest.mark.parametrize("dtype", [np.uint8, np.uint16, np.uint32, np.uint64])
@pytest.mark.parametrize("nonfirst", [False, True], ids=["first", "nonfirst"])
@pytest.mark.parametrize("cached", [False, True], ids=["fresh", "cached"])
def test_unsigned_stems_reach_real_strict_pipeline(
    boundary, monkeypatch, caplog, record_property, dtype, nonfirst, cached
):
    features = unsigned_features(dtype, nonfirst)
    paths = api._feature_cache_paths(boundary.payload)
    cache_path = api._analysis_cache_path(boundary.payload)
    assert not cache_path.exists()
    unsigned_key = "other" if nonfirst else "bass"
    source_bytes = None
    if cached:
        assert api._store_cached_local_audio_features(*paths, boundary.payload, features)
        loaded = api._load_cached_local_audio_features(*paths)
        assert loaded is not None
        assert loaded["stems"][unsigned_key].dtype == np.dtype(dtype)
        np.testing.assert_array_equal(
            loaded["stems"][unsigned_key], features["stems"][unsigned_key]
        )
        source_bytes = [path.read_bytes() for path in paths]
        boundary.writes.clear()

        def separation_unavailable(*args, **kwargs):
            boundary.trace.append("unavailable-separation")
            raise RuntimeError("synthetic separation unavailable sentinel")

        monkeypatch.setattr(api, "_run_stem_separation_with_timeout", separation_unavailable)
    else:
        # Exercise the real parent/native helper and local feature adapter, not an API stub.
        def native_unsigned_worker(source_path, result_queue, arrays_path=None):
            boundary.trace.append("synthetic-unsigned-native")
            result_queue.put(("ok", features))

        monkeypatch.setattr(api, "_stem_separation_worker", native_unsigned_worker)

    synthetic_pitch_chord_seams(monkeypatch)
    pipeline_calls = []
    real_pipeline = api._build_from_pipeline

    def pipeline(*args, **kwargs):
        pipeline_calls.append((args[0][unsigned_key].dtype.name, kwargs["allow_demo_fallback"]))
        return real_pipeline(*args, **kwargs)

    monkeypatch.setattr(api, "_build_from_pipeline", pipeline)
    updates = api.run_analysis_job_updates("unsigned-stems", boundary.payload, "timestamp")
    terminal = updates[-1]
    assert terminal["state"] == "succeeded", json.dumps(
        {"terminal": terminal, "trace": boundary.trace, "pipelineCalls": pipeline_calls}
    )
    assert terminal["cacheStatus"] == "stored"
    assert pipeline_calls == [(np.dtype(dtype).name, False)]
    song = terminal["result"]
    assert song["id"] == "analyzed-song" and api._valid_local_analysis_result(song)
    assert song["sections"] and all(section["partGraph"] for section in song["sections"])
    roles = [role for section in song["sections"] for role in section["roles"]]
    bass = next(role for role in roles if role["id"] == "bass-guitar")
    assert bass["range"] == {"lowestNote": "C2", "highestNote": "C3"}
    assert bass["harmony"]["chord"] == "C"
    assert "Failed to extract features" not in caplog.text
    assert "Stem activity detection failed" not in caplog.text
    assert boundary.builds == []
    if cached:
        assert any(u.get("progressLabel") == "Loaded reusable stems... (45%)" for u in updates)
        assert boundary.trace == []  # Unavailable sentinel was never called.
        assert boundary.writes == ["_store_cached_analysis"]
        assert [path.read_bytes() for path in paths] == source_bytes
    else:
        assert boundary.trace.count("start") == 1
        assert boundary.trace.count("synthetic-unsigned-native") == 1
        assert boundary.writes == ["_store_cached_local_audio_features", "_store_cached_analysis"]
        loaded = api._load_cached_local_audio_features(*paths)
        assert loaded["stems"][unsigned_key].dtype == np.dtype(dtype)
    assert api._load_cached_analysis(cache_path) == song
    replay = api.run_analysis_job("unsigned-replay", boundary.payload, "timestamp")
    assert replay["state"] == "succeeded" and replay["cacheStatus"] == "hit"
    assert replay["result"] == song and len(pipeline_calls) == 1
    record_property(
        "unsigned_real_pipeline",
        json.dumps(
            {
                "dtype": np.dtype(dtype).name,
                "nonfirst": nonfirst,
                "cachedFeatures": cached,
                "strictPipelineCalls": pipeline_calls,
                "trace": boundary.trace,
                "writes": boundary.writes,
                "resultId": song["id"],
            }
        ),
    )


@pytest.mark.parametrize(
    "dtype", [np.bool_, object, np.complex128], ids=["bool", "object", "complex"]
)
@pytest.mark.parametrize("nonfirst", [False, True], ids=["first", "nonfirst"])
@pytest.mark.parametrize("cached", [False, True], ids=["fresh", "cached"])
def test_unsigned_fix_retains_nonnumeric_fail_closed(
    boundary, monkeypatch, dtype, nonfirst, cached
):
    features = synthetic_features()
    key = "other" if nonfirst else "bass"
    features["stems"][key] = np.ones(1024, dtype=dtype)
    features["stem_role_types"][key] = "instrument"
    paths = api._feature_cache_paths(boundary.payload)
    previous = None
    if cached:
        assert api._store_cached_local_audio_features(*paths, boundary.payload, features)
        loaded = api._load_cached_local_audio_features(*paths)
        # Object arrays remain rejected by allow_pickle=False at the unchanged owner reader.
        assert (loaded is None) is (dtype is object)
        previous = [path.read_bytes() for path in paths]
        boundary.writes.clear()
    else:

        def native_invalid_worker(source_path, result_queue, arrays_path=None):
            result_queue.put(("ok", features))

        monkeypatch.setattr(api, "_stem_separation_worker", native_invalid_worker)

    updates = api.run_analysis_job_updates("nonnumeric-stems", boundary.payload, "timestamp")
    assert updates[-1]["state"] == "failed" and not any("result" in u for u in updates)
    assert boundary.trace.count("start") == 1
    assert boundary.writes == [] and boundary.builds == []
    assert not api._analysis_cache_path(boundary.payload).exists()
    if cached:
        assert [path.read_bytes() for path in paths] == previous
    else:
        assert not any(path.exists() for path in paths)


def test_inherited_npy_context_manager_boundary_is_unchanged(boundary):
    paths = api._feature_cache_paths(boundary.payload)
    assert api._store_cached_local_audio_features(*paths, boundary.payload, synthetic_features())
    with paths[1].open("wb") as arrays_file:
        np.save(arrays_file, np.ones(4), allow_pickle=False)
    original_bytes = [path.read_bytes() for path in paths]
    # Original raw-loader observation retained; orchestration escape receipt is in base evidence.
    with pytest.raises(TypeError, match="context manager"):
        api._load_cached_local_audio_features(*paths)
    boundary.writes.clear()
    assert [path.read_bytes() for path in paths] == original_bytes
    assert boundary.trace == [] and boundary.writes == [] and boundary.builds == []


@pytest.mark.parametrize("entrypoint", ["updates", "terminal"])
def test_actual_standalone_npy_cache_first_and_retry_fail_closed(
    boundary, caplog, record_property, entrypoint
):
    paths = api._feature_cache_paths(boundary.payload)
    assert api._store_cached_local_audio_features(*paths, boundary.payload, synthetic_features())
    with paths[1].open("wb") as arrays_file:
        np.save(arrays_file, np.ones(4), allow_pickle=False)
    # Real owner reader, real Path and harmless NPY: not an injected loader exception.
    with pytest.raises(TypeError, match="context manager"):
        api._load_cached_local_audio_features(*paths)
    boundary.writes.clear()
    private_files = {p: p.read_bytes() for p in boundary.root.rglob("*") if p.is_file()}
    cache_entries = sorted(str(p.relative_to(boundary.root)) for p in boundary.root.rglob("*"))
    attempts = []
    for attempt in ("first", "retry"):
        if entrypoint == "updates":
            updates = api.run_analysis_job_updates(attempt, boundary.payload, "timestamp")
        else:
            updates = [api.run_analysis_job(attempt, boundary.payload, "timestamp")]
        terminal = updates[-1]
        assert terminal["state"] == "failed"
        assert terminal["error"] == {
            "code": "engine_unavailable",
            "message": "Cached stems unavailable",
        }
        assert terminal["cacheStatus"] == "miss"
        assert not any("result" in update or update["state"] == "succeeded" for update in updates)
        assert boundary.trace == [] and boundary.writes == [] and boundary.builds == []
        assert not api._analysis_cache_path(boundary.payload).exists()
        assert {p: p.read_bytes() for p in boundary.root.rglob("*") if p.is_file()} == private_files
        assert sorted(str(p.relative_to(boundary.root)) for p in boundary.root.rglob("*")) == (
            cache_entries
        )
        surfaced = caplog.text + json.dumps(updates)
        assert str(boundary.root) not in surfaced
        assert all(str(path) not in surfaced for path in paths)
        attempts.append(
            {"attempt": attempt, "state": terminal["state"], "error": terminal["error"]}
        )
    record_property(
        "actual_npy_cache_boundary",
        json.dumps({"entrypoint": entrypoint, "attempts": attempts, "privateBytesPreserved": True}),
    )


def test_feature_cache_typeerror_catch_does_not_mask_consumer_bug(boundary, monkeypatch):
    paths = api._feature_cache_paths(boundary.payload)
    assert api._store_cached_local_audio_features(*paths, boundary.payload, synthetic_features())
    boundary.writes.clear()

    def invalid_consumer(features):
        raise TypeError("synthetic consumer programming error")

    monkeypatch.setattr(api, "_valid_local_audio_features", invalid_consumer)
    with pytest.raises(TypeError, match="synthetic consumer programming error"):
        api.run_analysis_job("consumer-bug", boundary.payload, "timestamp")
    assert boundary.trace == [] and boundary.writes == [] and boundary.builds == []


@pytest.fixture
def actual_pipeline_cues(boundary, monkeypatch):
    """Real short-signal builder output, with only pitch/chord inference seams injected."""
    synthetic_pitch_chord_seams(monkeypatch)
    features = synthetic_features()
    song = api._build_from_pipeline(
        features["stems"], features["sr"], 1.0, features, allow_demo_fallback=False
    )
    assert api._valid_local_analysis_result(song)
    assert song["sections"][0]["roles"] and song["sections"][0]["partGraph"]
    # A genuine first section remains intact while consumer checks the next entry.
    song["sections"] = [deepcopy(song["sections"][0]), deepcopy(song["sections"][0])]
    song["sections"][1]["id"] = "synthetic-nonfirst"
    return song


def malformed_cues(song, case):
    """Mutate one JSON-consumption property; this is not the full #970 schema."""
    result = deepcopy(song)
    section = result["sections"][1]
    mutations = {
        "sections-not-list": (result, "sections", {}),
        "sections-empty": (result, "sections", []),
        "sections-over-limit": (result, "sections", [song["sections"][0]] * 1025),
        "summary-headline-number": (result["exportSummary"], "headline", 17),
        "summary-focus-not-list": (result["exportSummary"], "focusSections", "verse"),
        "nonfirst-section-not-object": (result["sections"], 1, "private-cue-marker"),
        "nonfirst-id-number": (section, "id", 17),
        "nonfirst-label-null": (section, "label", None),
        "nonfirst-groove-list": (section, "groove", []),
        "nonfirst-start-bool": (section["timeRange"], "start", True),
        "nonfirst-start-negative": (section["timeRange"], "start", -1),
        "nonfirst-start-float": (section["timeRange"], "start", 0.5),
        "nonfirst-start-over-u32": (section["timeRange"], "start", 2**32),
        "nonfirst-end-equal": (section["timeRange"], "end", section["timeRange"]["start"]),
        "nonfirst-end-bool": (section["timeRange"], "end", True),
        "nonfirst-end-over-u32": (section["timeRange"], "end", 2**32),
        "nonfirst-confidence-source": (section["confidence"], "source", "private-cue-marker"),
        "nonfirst-confidence-notes": (section["confidence"], "notes", 17),
        "nonfirst-confidence-level": (section["confidence"], "level", "certain"),
        "nonfirst-demo-fingerprint": (
            section["confidence"],
            "notes",
            "Double-check the pickup into the chorus.",
        ),
        "nonfirst-roles-over-limit": (section, "roles", [{"id": "r"}] * 129),
        "nonfirst-graph-over-limit": (section, "partGraph", [{"role_id": "r"}] * 129),
        "nonfirst-role-not-object": (section, "roles", [{"id": "valid"}, "private-cue-marker"]),
        "nonfirst-graph-not-object": (
            section,
            "partGraph",
            [{"role_id": "valid"}, "private-cue-marker"],
        ),
    }
    target, key, value = mutations[case]
    target[key] = value
    return result


@pytest.mark.parametrize(
    "case",
    [
        "sections-not-list",
        "sections-empty",
        "sections-over-limit",
        "summary-headline-number",
        "summary-focus-not-list",
        "nonfirst-section-not-object",
        "nonfirst-id-number",
        "nonfirst-label-null",
        "nonfirst-groove-list",
        "nonfirst-start-bool",
        "nonfirst-start-negative",
        "nonfirst-start-float",
        "nonfirst-start-over-u32",
        "nonfirst-end-equal",
        "nonfirst-end-bool",
        "nonfirst-end-over-u32",
        "nonfirst-confidence-source",
        "nonfirst-confidence-notes",
        "nonfirst-confidence-level",
        "nonfirst-demo-fingerprint",
        "nonfirst-roles-over-limit",
        "nonfirst-graph-over-limit",
        "nonfirst-role-not-object",
        "nonfirst-graph-not-object",
    ],
)
def test_actual_cached_cues_rejected_on_first_and_retry(
    boundary, actual_pipeline_cues, case, caplog
):
    path = api._analysis_cache_path(boundary.payload)
    bad = malformed_cues(actual_pipeline_cues, case)
    # Raw owner admission deliberately remains unchanged; rejection belongs to consumption.
    assert api._store_cached_analysis(path, boundary.payload, bad)
    assert api._load_cached_analysis(path) == bad
    original_bytes = path.read_bytes()
    boundary.writes.clear()
    for attempt in ("first", "retry"):
        updates = api.run_analysis_job_updates(attempt, boundary.payload, "timestamp")
        terminal = updates[-1]
        assert terminal["state"] == "failed" and terminal["cacheStatus"] == "miss"
        assert terminal["error"] == {
            "code": "engine_unavailable",
            "message": "Stem separation failed",
        }
        assert not any("result" in update or update["state"] == "succeeded" for update in updates)
        assert path.read_bytes() == original_bytes
        assert api._load_cached_analysis(path) == bad
        assert boundary.writes == [] and boundary.builds == []
        assert not any(p.exists() for p in api._feature_cache_paths(boundary.payload))
        assert "private-cue-marker" not in caplog.text + json.dumps(updates)
        assert str(boundary.root) not in caplog.text + json.dumps(updates)
    assert boundary.trace.count("start") == 2


@pytest.mark.parametrize("case", ["sections-empty", "nonfirst-end-equal", "summary-focus-not-list"])
def test_invalid_result_cache_rebuilds_from_legitimate_npz_then_hits(
    boundary, monkeypatch, actual_pipeline_cues, case
):
    path = api._analysis_cache_path(boundary.payload)
    assert api._store_cached_analysis(
        path, boundary.payload, malformed_cues(actual_pipeline_cues, case)
    )
    paths = api._feature_cache_paths(boundary.payload)
    assert api._store_cached_local_audio_features(*paths, boundary.payload, synthetic_features())
    assert api._load_cached_local_audio_features(*paths) is not None
    prior_features = [p.read_bytes() for p in paths]
    boundary.writes.clear()
    calls = []
    pipeline = api._build_from_pipeline

    def strict_pipeline(*args, **kwargs):
        calls.append(kwargs["allow_demo_fallback"])
        return pipeline(*args, **kwargs)

    monkeypatch.setattr(api, "_build_from_pipeline", strict_pipeline)
    updates = api.run_analysis_job_updates("rebuild", boundary.payload, "timestamp")
    terminal = updates[-1]
    assert terminal["state"] == "succeeded" and terminal["cacheStatus"] == "stored"
    assert api._valid_local_analysis_result(terminal["result"])
    assert any(u.get("progressLabel") == "Loaded reusable stems... (45%)" for u in updates)
    assert calls == [False] and boundary.trace == [] and boundary.builds == []
    assert boundary.writes == ["_store_cached_analysis"]
    assert [p.read_bytes() for p in paths] == prior_features
    assert api._load_cached_analysis(path) == terminal["result"]
    retry = api.run_analysis_job("rebuild-retry", boundary.payload, "timestamp")
    assert retry["state"] == "succeeded" and retry["cacheStatus"] == "hit"
    assert retry["result"] == terminal["result"] and calls == [False]


def test_valid_consumer_list_and_timing_limits_remain_cache_hits(boundary, actual_pipeline_cues):
    song = deepcopy(actual_pipeline_cues)
    section = song["sections"][0]
    section["timeRange"] = {"start": 0, "end": 2**32 - 1}
    section["confidence"]["source"] = "user"
    section["roles"] = [deepcopy(section["roles"][0]) for _ in range(128)]
    section["partGraph"] = [deepcopy(section["partGraph"][0]) for _ in range(128)]
    song["sections"] = [section] + [deepcopy(song["sections"][1]) for _ in range(1023)]
    path = api._analysis_cache_path(boundary.payload)
    assert api._store_cached_analysis(path, boundary.payload, song)
    original_bytes = path.read_bytes()
    boundary.writes.clear()
    for attempt in ("first", "retry"):
        terminal = api.run_analysis_job(attempt, boundary.payload, "timestamp")
        assert terminal["state"] == "succeeded" and terminal["cacheStatus"] == "hit"
        assert terminal["result"] == song and path.read_bytes() == original_bytes
    assert boundary.trace == [] and boundary.writes == [] and boundary.builds == []


@pytest.mark.parametrize(
    "prior_features", [False, True], ids=["fresh-separation", "legitimate-npz"]
)
@pytest.mark.parametrize("fault", ["headline-number", "nonfirst-confidence-source"])
def test_actual_fresh_pipeline_invalid_cues_fail_without_publication(
    boundary, monkeypatch, caplog, record_property, prior_features, fault
):
    """Formatter/segmentation fault injection, not a demonstrated product source defect."""
    synthetic_pitch_chord_seams(monkeypatch)
    features = synthetic_features()
    paths = api._feature_cache_paths(boundary.payload)
    old_bytes = None
    if prior_features:
        assert api._store_cached_local_audio_features(*paths, boundary.payload, features)
        assert api._load_cached_local_audio_features(*paths) is not None
        old_bytes = [p.read_bytes() for p in paths]
    else:

        def native_worker(source_path, result_queue, arrays_path=None):
            boundary.trace.append("synthetic-valid-separation")
            result_queue.put(("ok", features))

        monkeypatch.setattr(api, "_stem_separation_worker", native_worker)
    boundary.writes.clear()
    if fault == "headline-number":
        monkeypatch.setattr(api, "_build_export_headline", lambda sections: 17)
    else:
        segment = api.segment_with_boundaries

        def malformed_segmentation(*args):
            sections, boundaries = segment(*args)
            assert sections and boundaries
            second = deepcopy(sections[0])
            second["id"] = "synthetic-nonfirst"
            second["confidence_source"] = "private-cue-marker"
            return [sections[0], second], [boundaries[0], boundaries[0]]

        monkeypatch.setattr(api, "segment_with_boundaries", malformed_segmentation)
    observations = []
    pipeline = api._build_from_pipeline

    def observe_pipeline(*args, **kwargs):
        result = pipeline(*args, **kwargs)
        observations.append((kwargs["allow_demo_fallback"], deepcopy(result)))
        return result

    monkeypatch.setattr(api, "_build_from_pipeline", observe_pipeline)
    for attempt in ("first", "retry"):
        updates = api.run_analysis_job_updates(attempt, boundary.payload, "timestamp")
        terminal = updates[-1]
        assert terminal["state"] == "failed" and terminal["cacheStatus"] == "miss"
        assert terminal["progressStage"] == "analyze"
        assert terminal["error"] == {"code": "engine_unavailable", "message": "Analysis failed"}
        assert not any("result" in u or u["state"] == "succeeded" for u in updates)
        assert not api._analysis_cache_path(boundary.payload).exists()
        assert boundary.writes == [] and boundary.builds == []
        if prior_features:
            assert [p.read_bytes() for p in paths] == old_bytes and boundary.trace == []
        else:
            assert not any(p.exists() for p in paths)
        assert "private-cue-marker" not in caplog.text + json.dumps(updates)
        assert str(boundary.root) not in caplog.text + json.dumps(updates)
    assert len(observations) == 2 and all(strict is False for strict, _ in observations)
    for _, result in observations:
        assert result["id"] == "analyzed-song" and result["sections"][0]["roles"]
        if fault == "headline-number":
            assert result["exportSummary"]["headline"] == 17
        else:
            assert result["sections"][0]["confidence"]["source"] == "model"
            assert result["sections"][1]["confidence"]["source"] == "private-cue-marker"
    if not prior_features:
        assert boundary.trace.count("start") == 2
        assert boundary.trace.count("synthetic-valid-separation") == 2
    record_property(
        "invalid_pipeline_cue_injection",
        json.dumps(
            {
                "fault": fault,
                "priorLegitimateNPZ": prior_features,
                "strictPipelineReturns": 2,
                "attemptsFailed": 2,
                "cacheWrites": [],
            }
        ),
    )
