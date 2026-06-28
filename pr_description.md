🎯 **What:** The vulnerabilities fixed
A path traversal vulnerability in `services/analysis-engine/src/bandscope_analysis/api.py` via the `cacheRoot` and `tempRoot` request parameters. The parameters were being concatenated without proper sanitization. Additionally, an injection vulnerability via `sourceLabel` and `roleFocus` parameters missing string sanitization.

⚠️ **Risk:** The potential impact if left unfixed
A malicious payload containing `../` in `cacheRoot` or `tempRoot` could allow a user or another process to write cache and temp files outside of the designated directories (e.g. overwriting critical system files or unauthorized access to other directories). Unsanitized `sourceLabel` or `roleFocus` inputs could allow shell/command injection via strings containing escapes or separators like `;`, `'`, `"`, `|`, `&`, etc.

🛡️ **Solution:** How the fix addresses the vulnerability
Added explicit validation logic within `validate_analysis_job_request` to reject any `cacheRoot` or `tempRoot` path that contains `..`. This effectively blocks basic directory ascension payloads. Added input sanitization to `sourceLabel` and `roleFocus` strings, rejecting inputs containing shell/script meta-characters (`'`, `"`, `\`, `;`, `|`, `` ` ``, `$`, `<`, `>`, `&`). Added corresponding test cases in `test_api.py`.
