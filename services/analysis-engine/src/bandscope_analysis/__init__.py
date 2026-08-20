"""BandScope analysis engine package."""

import logging
from importlib import import_module

from .health import build_health_report


class _ApiDiagnosticPrivacyFilter(logging.Filter):
    """Remove traceback payloads from the public analysis API's routine diagnostics."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Keep the safe operation message while discarding exception traceback state."""
        record.exc_info = None
        record.exc_text = None
        return True


_api_logger = logging.getLogger("bandscope_analysis.api")
_api_logger.addFilter(_ApiDiagnosticPrivacyFilter())
_api_module = import_module(".api", __name__)
get_analysis_status = _api_module.get_analysis_status

__all__ = ["build_health_report", "get_analysis_status"]
