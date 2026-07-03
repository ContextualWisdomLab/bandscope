import re

with open("services/analysis-engine/tests/test_youtube.py", "r") as f:
    content = f.read()

# Replace the specific mock returns
content = re.sub(
    r'(\s+)mock_ydl\.extract_info\.return_value = mock_info',
    r'\1mock_ydl.extract_info.return_value = mock_info\1mock_ydl.process_ie_result.return_value = mock_info',
    content
)

content = re.sub(
    r'(\s+)mock_ydl\.extract_info\.return_value = \{"id": "123"\}',
    r'\1mock_ydl.extract_info.return_value = {"id": "123"}\1mock_ydl.process_ie_result.return_value = {"id": "123"}',
    content
)

content = re.sub(
    r'(\s+)mock_ydl\.extract_info\.side_effect = \[\{"duration": 60\}, None\]',
    r'\1mock_ydl.extract_info.return_value = {"duration": 60}\1mock_ydl.process_ie_result.return_value = None',
    content
)

content = re.sub(
    r'(\s+)mock_ydl\.extract_info\.assert_has_calls\(',
    r'\1assert mock_ydl.extract_info.call_count == 1\1assert mock_ydl.process_ie_result.call_count == 1\1mock_ydl.extract_info.assert_has_calls(',
    content
)

content = content.replace(
    "                call(input_url, download=True),",
    ""
)

# In test_module_execution, process_ie_result is called which returns the mock object that is not serializable.
# Let's fix this mock correctly:
content = content.replace(
    "        mock_ydl.extract_info.return_value = {\"id\": \"123\"}\n        mock_ydl.process_ie_result.return_value = {\"id\": \"123\"}",
    "        mock_ydl.extract_info.return_value = {\"id\": \"123\"}\n        mock_ydl.process_ie_result.return_value = {\"id\": \"123\"}\n        # Fix mock for json.dumps in runpy\n        class MockDict(dict):\n            def get(self, *args):\n                return super().get(*args)\n        mock_ydl.process_ie_result.return_value = MockDict({\"id\": \"123\", \"duration\": 60})"
)

with open("services/analysis-engine/tests/test_youtube.py", "w") as f:
    f.write(content)
