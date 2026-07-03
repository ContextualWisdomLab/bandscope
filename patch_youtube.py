with open("services/analysis-engine/src/bandscope_analysis/youtube.py", "r") as f:
    content = f.read()

content = content.replace("info = ydl.extract_info(url, download=True)", "info = ydl.process_ie_result(info, download=True)")

with open("services/analysis-engine/src/bandscope_analysis/youtube.py", "w") as f:
    f.write(content)
