"""Deterministic lifecycle contracts for stem-separation timeouts."""

from __future__ import annotations

import queue
from unittest.mock import patch

import pytest

from bandscope_analysis.api import StemSeparationTimedOut, _run_stem_separation_with_timeout


def test_live_worker_times_out_after_an_empty_result_poll() -> None:
    """A live worker is stopped only after the result poll and deadline both expire."""

    class EmptyResultQueue:
        """Record the bounded poll and lifecycle cleanup performed by the parent."""

        def __init__(self) -> None:
            self.get_timeouts: list[float] = []
            self.closed = False
            self.joined = False

        def get(self, timeout: float) -> tuple[str, object]:
            self.get_timeouts.append(timeout)
            raise queue.Empty

        def close(self) -> None:
            self.closed = True

        def join_thread(self) -> None:
            self.joined = True

    class LiveProcess:
        """Model a worker that remains alive until the timeout path terminates it."""

        def __init__(self, *_args: object, **_kwargs: object) -> None:
            self.terminated = False
            self.killed = False
            self.join_timeouts: list[float | None] = []

        def start(self) -> None:
            return None

        def is_alive(self) -> bool:
            return not self.terminated and not self.killed

        def terminate(self) -> None:
            self.terminated = True

        def kill(self) -> None:
            self.killed = True

        def join(self, timeout: float | None = None) -> None:
            self.join_timeouts.append(timeout)

    result_queue = EmptyResultQueue()
    process = LiveProcess()

    class TimeoutContext:
        """Return the single deterministic queue and process used by this contract."""

        def Queue(self, maxsize: int) -> EmptyResultQueue:
            assert maxsize == 1
            return result_queue

        def Process(self, *_args: object, **_kwargs: object) -> LiveProcess:
            return process

    with (
        patch("bandscope_analysis.api._multiprocessing_context", return_value=TimeoutContext()),
        patch("bandscope_analysis.api.time.monotonic", side_effect=[0.0, 0.0, 2.0]),
        pytest.raises(StemSeparationTimedOut, match=r"Stem separation exceeded 1s\.$"),
    ):
        _run_stem_separation_with_timeout("/tmp/audio.wav", timeout_seconds=1.0)

    assert result_queue.get_timeouts == [pytest.approx(0.05)]
    assert process.terminated is True
    assert process.killed is False
    assert process.join_timeouts == [1]
    assert result_queue.closed is True
    assert result_queue.joined is True
