"""BandScope analysis engine package and application composition root."""

from . import api as _api
from .health import build_health_report
from .stop_projection import with_detected_stop_projection

# Keep the public API module as the stable import boundary while composing the
# rehearsal-cue projector around the existing analysis builder. Internal job
# orchestration resolves this module global at call time, so local-audio jobs
# and direct API callers share the same decoded-stop behavior.
_api.build_demo_rehearsal_song = with_detected_stop_projection(_api.build_demo_rehearsal_song)
get_analysis_status = _api.get_analysis_status

__all__ = ["build_health_report", "get_analysis_status"]
