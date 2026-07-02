import re

with open("services/analysis-engine/src/bandscope_analysis/youtube.py", "r") as f:
    content = f.read()

# Change the logging of the exception to avoid leaking information
content = content.replace(
    'logger.error(f"Security: Unexpected error during download: {e}")',
    'logger.error("Security: Unexpected error during download")'
)

# And what about the DownloadError? yt_dlp.utils.DownloadError might also contain sensitive info (e.g. cookies or local paths)!
content = content.replace(
    'logger.warning(f"Security: Download error: {e}")',
    'logger.warning("Security: Download error occurred")'
)

# Any other `{e}`?
content = content.replace(
    'logger.warning(f"Security: URL parsing error {e}")',
    'logger.warning("Security: URL parsing error")'
)

with open("services/analysis-engine/src/bandscope_analysis/youtube.py", "w") as f:
    f.write(content)
