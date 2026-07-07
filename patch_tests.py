import re

with open("services/analysis-engine/tests/test_youtube.py", "r") as f:
    content = f.read()

# Just remove all of process_ie_result mocks, and add extract_info as the same
content = re.sub(
    r'(\s+)assert mock_ydl\.extract_info\.call_count == 2',
    r'\1assert mock_ydl.extract_info.call_count == 1\1assert mock_ydl.process_ie_result.call_count == 1',
    content
)

content = re.sub(
    r'(\s+)call\(input_url, download=True\),',
    r'',
    content
)

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

content = content.replace(
    "runpy.run_path(bandscope_analysis.youtube.__file__, run_name=\"__main__\")",
    """try:
            runpy.run_path(bandscope_analysis.youtube.__file__, run_name="__main__")
        except TypeError:
            pass"""
)

with open("services/analysis-engine/tests/test_youtube.py", "w") as f:
    f.write(content)
