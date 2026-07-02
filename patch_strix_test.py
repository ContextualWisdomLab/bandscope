import re
with open("services/analysis-engine/tests/test_youtube.py", "r") as f:
    content = f.read()

content = content.replace(
    'WARNING  bandscope_analysis.youtube:youtube.py:209 Security: Download error: Failed to extract info',
    'WARNING  bandscope_analysis.youtube:youtube.py:209 Security: Download error occurred'
)
content = content.replace(
    'WARNING  bandscope_analysis.youtube:youtube.py:209 Security: Download error: Some random network error for https://youtube.com/watch?v=abc123DEF45 with cookie=secret and /Users/test/local/path',
    'WARNING  bandscope_analysis.youtube:youtube.py:209 Security: Download error occurred'
)
content = content.replace(
    'ERROR    bandscope_analysis.youtube:youtube.py:212 Security: Unexpected error during download: Unexpected explosion with token=secret in /Users/test/private/path',
    'ERROR    bandscope_analysis.youtube:youtube.py:212 Security: Unexpected error during download'
)
# Note: since the log content checks in pytest might just use caplog.text or we just saw those strings in the output of the failure.
# Wait! Did we assert the log output in `test_youtube.py`?
# NO! The test coverage report just showed what was logged during the test! Pytest automatically captures logs.
