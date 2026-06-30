with open("services/analysis-engine/pyproject.toml", "r") as f:
    content = f.read()

# Add interrogate exclude
search_str = """[tool.pytest.ini_options]"""
replace_str = """[tool.interrogate]
exclude = ["build", "docs", "setup.py", ".venv"]

[tool.pytest.ini_options]"""

if "[tool.interrogate]" not in content:
    content = content.replace(search_str, replace_str)

with open("services/analysis-engine/pyproject.toml", "w") as f:
    f.write(content)
