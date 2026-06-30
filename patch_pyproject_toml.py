with open("pyproject.toml", "r") as f:
    content = f.read()

# Add interrogate exclude
search_str = """[tool.bandscope]"""
replace_str = """[tool.interrogate]
exclude = ["build", "docs", "setup.py", ".venv", "services/analysis-engine/.venv"]

[tool.bandscope]"""

if "[tool.interrogate]" not in content:
    content = content.replace(search_str, replace_str)

with open("pyproject.toml", "w") as f:
    f.write(content)
