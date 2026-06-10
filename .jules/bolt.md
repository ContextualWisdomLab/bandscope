
## 2024-05-18 - Avoid sequence of stat calls

**Learning:** When checking for multiple potential file extensions in Python on networked/slower file systems, running multiple `os.path.exists()` in a loop creates significant overhead (N round trips).
**Action:** Replace sequential `exists` calls with a single `glob.iglob(glob.escape(base) + ".*")` check coupled with `endswith()`. Use `glob.escape()` to avoid unintended regex expansion of characters like `[]` in directory names.
