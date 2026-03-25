with open("src/bandscope_analysis/api.py", "r") as f:
    content = f.read()

content = content.replace('from typing import Literal, NotRequired, TypedDict, cast', 'from typing import Any, Literal, NotRequired, TypedDict, cast')

with open("src/bandscope_analysis/api.py", "w") as f:
    f.write(content)
