"""BandScope analysis engine package."""

import logging


class _ApiDiagnosticPrivacyFilter(logging.Filter):
    """Remove traceback payloads from the public analysis API's routine diagnostics."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Keep the safe operation message while discarding exception traceback state."""
        record.exc_info = None
        record.exc_text = None
        return True


_api_logger = logging.getLogger("bandscope_analysis.api")
_api_logger.addFilter(_ApiDiagnosticPrivacyFilter())

from .api import get_analysis_status
from .health import build_health_report

__all__ = ["build_health_report", "get_analysis_status"]
