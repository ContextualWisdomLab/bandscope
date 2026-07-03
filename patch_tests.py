import re

with open("services/analysis-engine/tests/test_youtube.py", "r") as f:
    content = f.read()

# Make sure process_ie_result correctly returns something that can be JSON serialized.
# Also make sure to cover test_download_youtube_audio_duration_exceeded properly
content = re.sub(
    r'(\s+)mock_ydl\.extract_info\.return_value = \{"id": "123", "duration": 16 \* 60\}',
    r'\1mock_ydl.extract_info.return_value = {"id": "123", "duration": 16 * 60}\1mock_ydl.process_ie_result.return_value = {"id": "123", "duration": 16 * 60}',
    content
)

content = re.sub(
    r'(\s+)mock_ydl\.extract_info\.return_value = \{"id": "123", "duration": 10 \* 60\}',
    r'\1mock_ydl.extract_info.return_value = {"id": "123", "duration": 10 * 60}\1mock_ydl.process_ie_result.return_value = {"id": "123", "duration": 10 * 60}',
    content
)

with open("services/analysis-engine/tests/test_youtube.py", "w") as f:
    f.write(content)
