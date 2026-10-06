"""Private subprocess witness: actual pinned CLI/API; synthetic native/media seams only."""

from __future__ import annotations

import hashlib
import importlib.abc
import json
import os
import runpy
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

SOURCE = Path(__file__).resolve().parents[1] / "src"
TRACE: list[str] = []
MODE = "no_native"


class NoRealML(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split(".")[0] in {
            "torch",
            "torchaudio",
            "demucs",
            "numba",
            "soundfile",
            "bandscope_numeric",
            "librosa",
        }:
            raise AssertionError("Forbidden real native/media/ML import: " + fullname)
        return None


def module(name, **attributes):
    item = ModuleType(name)
    item.__dict__.update(attributes)
    sys.modules[name] = item
    return item


class TemporalSeam:
    def __init__(self):
        TRACE.append("temporal.construct")

    def analyze(self, path):
        TRACE.append("temporal.analyze")
        if MODE == "temporal_failure":
            raise RuntimeError("Synthetic private-temporal-detail: /synthetic/private-detail.wav")
        if MODE == "temporal_private_bpm":
            return {"bpm": "/synthetic/private-bpm-marker", "beats": []}
        return {"bpm": 120.0, "beats": []}


class ModelArtifactError(ValueError):
    pass


class SeparationSeam:
    def __init__(self):
        TRACE.append("native.separator.construct")

    def separate(self, source_path):
        TRACE.append("native.separator.separate")
        if MODE in ("native_failure", "temporal_failure", "temporal_private_bpm"):
            raise RuntimeError("Synthetic private-native-detail: /synthetic/private-detail.wav")
        if MODE != "synthetic_success":
            raise AssertionError("Invalid scope reached native separation")
        import numpy as np

        return {
            "stems": {
                name: np.sin(np.arange(1024) * 0.1).astype(np.float32)
                for name in ("vocals", "bass", "drums", "other")
            },
            "sample_rate": 22050,
            "duration_seconds": 1.0,
            "chunk_count": 1,
            "stem_role_types": {
                "vocals": "vocal",
                "bass": "instrument",
                "drums": "instrument",
                "other": "instrument",
            },
            "separation_notes": "Synthetic worker seam; no audio decoded or inference run",
        }


class QueueSeam:
    def __init__(self, maxsize):
        assert maxsize == 1
        self.item = None

    def put(self, item):
        self.item = item

    def get(self, timeout):
        assert timeout > 0 and self.item is not None
        return self.item

    def close(self):
        TRACE.append("native.queue.close")

    def join_thread(self):
        TRACE.append("native.queue.join_thread")


class ProcessSeam:
    def __init__(self, target, args):
        TRACE.append("native.process.construct")
        self.target, self.args = target, args

    def start(self):
        TRACE.append("native.process.start")
        self.target(*self.args)  # Real canonical worker; no actual native child.

    def is_alive(self):
        return False

    def join(self, timeout=None):
        TRACE.append("native.process.join")


class PitchSeam:
    def track(self, *args, **kwargs):
        TRACE.append("synthetic.pitch")
        return {"lowest_note": "C2", "highest_note": "C3"}


class ChordSeam:
    def recognize(self, *args, **kwargs):
        TRACE.append("synthetic.chord")
        return [{"chord": "C"}]


def install_seams():
    # Preinject narrow nonexecuting imports, then block all real ML/native resolution.
    module("librosa")
    module("bandscope_analysis.temporal", TemporalAnalyzer=TemporalSeam)
    module(
        "bandscope_analysis.separation",
        AudioStemSeparator=SeparationSeam,
        ModelArtifactError=ModelArtifactError,
    )
    module(
        "bandscope_analysis._native",
        HAVE_RUST=False,
        _checkerboard_novelty_rust=None,
        _viterbi_decode_rust=None,
    )
    module("bandscope_analysis.ranges", __path__=[])
    module("bandscope_analysis.ranges.pitch_tracker", PitchTracker=PitchSeam)
    module("bandscope_analysis.chords", __path__=[str(SOURCE / "bandscope_analysis/chords")])
    module("bandscope_analysis.chords.chord_recognizer", ChordRecognizer=ChordSeam)
    sys.meta_path.insert(0, NoRealML())
    sys.path.insert(0, str(SOURCE))


def run_transport(tmp_path, data, mode="no_native", progress=False, entry="module", args=None):
    """Run only the fixed repository CLI fixture with private, bounded inputs."""
    import subprocess

    receipt = tmp_path / "probe.json"
    env = {
        "PATH": "/usr/bin:/bin",
        "HOME": str(tmp_path),
        "TMPDIR": str(tmp_path),
        "PYTHONDONTWRITEBYTECODE": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "OMP_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "VECLIB_MAXIMUM_THREADS": "1",
        "NUMBA_NUM_THREADS": "1",
    }
    argv = [sys.executable, str(Path(__file__).resolve()), mode, entry, str(receipt)]
    if progress:
        argv.append("--progress-jsonl")
    argv.extend(args or [])
    completed = subprocess.run(
        argv,
        cwd=SOURCE.parent,
        input=json.dumps(data) if data is not None else "",
        text=True,
        capture_output=True,
        env=env,
        timeout=10,
        check=False,
    )
    assert receipt.exists(), completed.stderr
    observed = json.loads(receipt.read_text())
    (tmp_path / "transport-observation.json").write_text(
        json.dumps(
            {
                "argv": argv,
                "returncode": completed.returncode,
                "stdout": completed.stdout,
                "stderr": completed.stderr,
                "receipt": observed,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    assert observed["noRealMLImported"]
    assert observed["apiOrigin"] == str(SOURCE / "bandscope_analysis/api.py")
    assert observed["cliOrigin"] == str(SOURCE / "bandscope_analysis/cli.py")
    return completed, observed


def local_payload(tmp_path):
    """Valid metadata; the synthetic source is never opened or decoded."""
    return {
        "jobId": "cli-contract-job",
        "request": {
            "sourceKind": "local_audio",
            "projectId": "private-contract-project",
            "sourceLabel": "fixture.wav",
            "roleFocus": ["bass-guitar"],
            "localSource": {
                "sourcePath": str(tmp_path / "never-opened.wav"),
                "fileName": "fixture.wav",
                "extension": "wav",
                "fileSizeBytes": 64,
            },
        },
    }


def block_network(event, args):
    if event in {"socket.connect", "socket.getaddrinfo", "subprocess.Popen"}:
        raise AssertionError("Real network/subprocess forbidden in fixture")


def main():
    global MODE
    MODE, entry_kind, receipt = sys.argv[1:4]
    cli_args = sys.argv[4:]
    assert MODE in {
        "no_native",
        "native_failure",
        "synthetic_success",
        "temporal_failure",
        "temporal_private_bpm",
        "api_validation",
    }
    assert entry_kind in {"module", "main"}
    sys.addaudithook(block_network)
    install_seams()
    import bandscope_analysis.api as api

    api._multiprocessing_context = lambda: SimpleNamespace(Queue=QueueSeam, Process=ProcessSeam)
    cli_path = SOURCE / "bandscope_analysis/cli.py"
    sys.argv = [str(cli_path), *cli_args]
    try:
        if MODE == "api_validation":
            request = json.load(sys.stdin)["request"]
            try:
                api.validate_analysis_job_request(request)
            except ValueError as error:
                validation_error = str(error)
            else:
                raise AssertionError("Expected invalid request")
            print(
                json.dumps(
                    {
                        "validationError": validation_error,
                        "run": api.run_analysis_job(
                            "cli-contract-job", request, "2026-10-05T00:00:00Z"
                        ),
                        "updates": list(
                            api.run_analysis_job_updates(
                                "cli-contract-job", request, "2026-10-05T00:00:00Z"
                            )
                        ),
                    }
                )
            )
        elif entry_kind == "module":
            runpy.run_module("bandscope_analysis.cli", run_name="__main__")
        else:
            namespace = runpy.run_module("bandscope_analysis.cli", run_name="fixture_cli")
            raise SystemExit(namespace["main"]())
    finally:
        assert not any(name in sys.modules for name in ("torch", "demucs", "numba", "soundfile"))
        Path(receipt).write_text(
            json.dumps(
                {
                    "trace": TRACE,
                    "mode": MODE,
                    "entryKind": entry_kind,
                    "cliOrigin": str(cli_path),
                    "cliSha256": hashlib.sha256(cli_path.read_bytes()).hexdigest(),
                    "apiOrigin": api.__file__,
                    "apiSha256": hashlib.sha256(Path(api.__file__).read_bytes()).hexdigest(),
                    "noRealMLImported": True,
                    "librosaIsEmptySeam": len(vars(sys.modules["librosa"])) == 5,
                    "interpreter": sys.executable,
                    "tmpdir": os.environ["TMPDIR"],
                },
                indent=2,
            ),
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
