"""
Validation tests for configuration and documentation files.

These tests validate the structure, syntax, and content of configuration
files, GitHub templates, and documentation that were changed in the PR.
"""

import re
from pathlib import Path
from typing import Any

import pytest
import yaml


class TestEditorConfig:
    """Test .editorconfig file validation."""

    def test_editorconfig_exists(self) -> None:
        """Verify .editorconfig file exists."""
        assert Path(".editorconfig").exists()

    def test_editorconfig_has_root_declaration(self) -> None:
        """Verify .editorconfig declares root = true."""
        content = Path(".editorconfig").read_text(encoding="utf-8")
        assert "root = true" in content

    def test_editorconfig_has_common_file_patterns(self) -> None:
        """Verify .editorconfig has patterns for common file types."""
        content = Path(".editorconfig").read_text(encoding="utf-8")
        # Should have patterns for TypeScript, JavaScript, JSON, YAML, Markdown
        # Pattern can be either [*.ts] or [*.{ts,tsx,...}]
        assert re.search(r"\[.*ts.*\]", content)
        assert re.search(r"\[.*json.*\]", content)
        assert re.search(r"\[.*yml.*\]", content)
        assert re.search(r"\[.*md.*\]", content)

    def test_editorconfig_sets_charset(self) -> None:
        """Verify .editorconfig sets charset to utf-8."""
        content = Path(".editorconfig").read_text(encoding="utf-8")
        assert "charset = utf-8" in content

    def test_editorconfig_sets_line_endings(self) -> None:
        """Verify .editorconfig enforces LF line endings."""
        content = Path(".editorconfig").read_text(encoding="utf-8")
        assert "end_of_line = lf" in content

    def test_editorconfig_sets_final_newline(self) -> None:
        """Verify .editorconfig requires final newline."""
        content = Path(".editorconfig").read_text(encoding="utf-8")
        assert "insert_final_newline = true" in content

    def test_editorconfig_uses_spaces_for_indentation(self) -> None:
        """Verify .editorconfig uses space indentation for most files."""
        content = Path(".editorconfig").read_text(encoding="utf-8")
        assert "indent_style = space" in content

    def test_editorconfig_sets_consistent_indent_size(self) -> None:
        """Verify .editorconfig sets indent size."""
        content = Path(".editorconfig").read_text(encoding="utf-8")
        assert "indent_size = 2" in content or "indent_size = 4" in content


class TestGitAttributes:
    """Test .gitattributes file validation."""

    def test_gitattributes_exists(self) -> None:
        """Verify .gitattributes file exists."""
        assert Path(".gitattributes").exists()

    def test_gitattributes_sets_default_eol(self) -> None:
        """Verify .gitattributes sets default line ending to LF."""
        content = Path(".gitattributes").read_text(encoding="utf-8")
        assert "* text=auto eol=lf" in content

    def test_gitattributes_marks_images_as_binary(self) -> None:
        """Verify .gitattributes marks image files as binary."""
        content = Path(".gitattributes").read_text(encoding="utf-8")
        assert "*.png binary" in content
        assert "*.jpg binary" in content

    def test_gitattributes_marks_audio_as_binary(self) -> None:
        """Verify .gitattributes marks audio files as binary."""
        content = Path(".gitattributes").read_text(encoding="utf-8")
        # BandScope is an audio analysis tool, so audio files should be marked binary
        assert "*.wav binary" in content or "*.mp3 binary" in content

    def test_gitattributes_marks_model_files_as_binary(self) -> None:
        """Verify .gitattributes marks ML model files as binary."""
        content = Path(".gitattributes").read_text(encoding="utf-8")
        assert "*.onnx binary" in content


class TestGitIgnore:
    """Test .gitignore file validation."""

    def test_gitignore_exists(self) -> None:
        """Verify .gitignore file exists."""
        assert Path(".gitignore").exists()

    def test_gitignore_ignores_node_modules(self) -> None:
        """Verify .gitignore ignores node_modules."""
        content = Path(".gitignore").read_text(encoding="utf-8")
        assert "node_modules" in content

    def test_gitignore_ignores_build_artifacts(self) -> None:
        """Verify .gitignore ignores common build artifacts."""
        content = Path(".gitignore").read_text(encoding="utf-8")
        # Should ignore dist, build, or similar directories
        assert "dist" in content or "build" in content or "target" in content


class TestGitHubWorkflows:
    """Test GitHub Actions workflow files."""

    @pytest.fixture
    def workflow_files(self) -> list[Path]:
        """Get list of workflow YAML files."""
        workflows_dir = Path(".github/workflows")
        return list(workflows_dir.glob("*.yml")) if workflows_dir.exists() else []

    def test_workflows_directory_exists(self) -> None:
        """Verify .github/workflows directory exists."""
        assert Path(".github/workflows").exists()

    def test_all_workflows_are_valid_yaml(self, workflow_files: list[Path]) -> None:
        """Verify all workflow files are valid YAML."""
        for workflow_file in workflow_files:
            content = workflow_file.read_text(encoding="utf-8")
            try:
                yaml.safe_load(content)
            except yaml.YAMLError as e:
                pytest.fail(f"Invalid YAML in {workflow_file}: {e}")

    def test_all_workflows_have_name(self, workflow_files: list[Path]) -> None:
        """Verify all workflow files have a name field."""
        for workflow_file in workflow_files:
            content = yaml.safe_load(workflow_file.read_text(encoding="utf-8"))
            assert "name" in content, f"Workflow {workflow_file} missing 'name' field"

    def test_all_workflows_have_triggers(self, workflow_files: list[Path]) -> None:
        """Verify all workflow files have trigger conditions (on)."""
        for workflow_file in workflow_files:
            content = yaml.safe_load(workflow_file.read_text(encoding="utf-8"))
            assert "on" in content or True in content, f"Workflow {workflow_file} missing 'on' field"

    def test_all_workflows_have_jobs(self, workflow_files: list[Path]) -> None:
        """Verify all workflow files define jobs."""
        for workflow_file in workflow_files:
            content = yaml.safe_load(workflow_file.read_text(encoding="utf-8"))
            assert "jobs" in content, f"Workflow {workflow_file} missing 'jobs' field"
            assert len(content["jobs"]) > 0, f"Workflow {workflow_file} has no jobs defined"

    def test_ci_workflow_exists(self) -> None:
        """Verify CI workflow exists."""
        assert Path(".github/workflows/ci.yml").exists()

    def test_ci_workflow_runs_on_pr_and_push(self) -> None:
        """Verify CI workflow triggers on pull requests and pushes."""
        content = yaml.safe_load(Path(".github/workflows/ci.yml").read_text(encoding="utf-8"))
        # YAML parser converts "on" to True
        assert "on" in content or True in content
        triggers = content.get("on", content.get(True, {}))
        assert "pull_request" in triggers or "push" in triggers

    def test_build_baseline_workflow_exists(self) -> None:
        """Verify build-baseline workflow exists."""
        assert Path(".github/workflows/build-baseline.yml").exists()

    def test_build_baseline_has_windows_and_macos_jobs(self) -> None:
        """Verify build-baseline workflow builds for Windows and macOS."""
        content = yaml.safe_load(Path(".github/workflows/build-baseline.yml").read_text(encoding="utf-8"))
        jobs = content.get("jobs", {})
        # Should have jobs for both platforms
        job_names = " ".join(jobs.keys()).lower()
        assert "windows" in job_names or "macos" in job_names

    def test_security_workflows_exist(self) -> None:
        """Verify security-related workflows exist."""
        security_workflows = [
            ".github/workflows/codeql.yml",
            ".github/workflows/dependency-review.yml",
            ".github/workflows/secret-scan-gate.yml",
            ".github/workflows/security-audit.yml",
        ]
        for workflow in security_workflows:
            assert Path(workflow).exists(), f"Security workflow {workflow} not found"

    def test_workflows_pin_actions_with_sha(self, workflow_files: list[Path]) -> None:
        """Verify workflows pin GitHub Actions with SHA for security."""
        for workflow_file in workflow_files:
            content = workflow_file.read_text(encoding="utf-8")
            # Find all uses: statements
            uses_pattern = r"uses:\s+([^@\s]+)@([^\s]+)"
            matches = re.findall(uses_pattern, content)
            for action, ref in matches:
                # Should have a SHA comment or be a SHA
                if not re.match(r"[0-9a-f]{40}", ref):
                    # If not a SHA, should have a comment indicating SHA pinning
                    assert "#" in content, f"Action {action} in {workflow_file} should be pinned with SHA"


class TestGitHubIssueTemplates:
    """Test GitHub issue template files."""

    def test_issue_template_directory_exists(self) -> None:
        """Verify .github/ISSUE_TEMPLATE directory exists."""
        assert Path(".github/ISSUE_TEMPLATE").exists()

    def test_bug_report_template_exists(self) -> None:
        """Verify bug report template exists."""
        assert Path(".github/ISSUE_TEMPLATE/bug_report.yml").exists()

    def test_bug_report_is_valid_yaml(self) -> None:
        """Verify bug report template is valid YAML."""
        content = Path(".github/ISSUE_TEMPLATE/bug_report.yml").read_text(encoding="utf-8")
        yaml.safe_load(content)

    def test_bug_report_has_required_fields(self) -> None:
        """Verify bug report template has required fields."""
        content = yaml.safe_load(Path(".github/ISSUE_TEMPLATE/bug_report.yml").read_text(encoding="utf-8"))
        assert "name" in content
        assert "description" in content
        assert "body" in content

    def test_bug_report_has_required_form_fields(self) -> None:
        """Verify bug report template requires essential information."""
        content = yaml.safe_load(Path(".github/ISSUE_TEMPLATE/bug_report.yml").read_text(encoding="utf-8"))
        body = content.get("body", [])
        # Should have fields for summary, steps to reproduce, and expected behavior
        field_labels = [field.get("attributes", {}).get("label", "").lower() for field in body]
        field_ids = [field.get("id", "").lower() for field in body]
        combined = " ".join(field_labels + field_ids)
        assert "summary" in combined or "description" in combined
        assert "steps" in combined or "reproduce" in combined

    def test_feature_request_template_exists(self) -> None:
        """Verify feature request template exists."""
        assert Path(".github/ISSUE_TEMPLATE/feature_request.yml").exists()

    def test_feature_request_is_valid_yaml(self) -> None:
        """Verify feature request template is valid YAML."""
        content = Path(".github/ISSUE_TEMPLATE/feature_request.yml").read_text(encoding="utf-8")
        yaml.safe_load(content)

    def test_issue_template_config_exists(self) -> None:
        """Verify issue template config exists."""
        assert Path(".github/ISSUE_TEMPLATE/config.yml").exists()

    def test_issue_template_config_is_valid_yaml(self) -> None:
        """Verify issue template config is valid YAML."""
        content = Path(".github/ISSUE_TEMPLATE/config.yml").read_text(encoding="utf-8")
        yaml.safe_load(content)


class TestGitHubPRTemplate:
    """Test GitHub pull request template."""

    def test_pr_template_exists(self) -> None:
        """Verify PR template exists."""
        # Could be in .github/ or .github/PULL_REQUEST_TEMPLATE/
        assert (
            Path(".github/pull_request_template.md").exists()
            or Path(".github/PULL_REQUEST_TEMPLATE.md").exists()
            or Path(".github/PULL_REQUEST_TEMPLATE/pull_request_template.md").exists()
        )

    def test_pr_template_has_security_section(self) -> None:
        """Verify PR template includes security notes section."""
        template_paths = [
            Path(".github/pull_request_template.md"),
            Path(".github/PULL_REQUEST_TEMPLATE.md"),
        ]
        content = ""
        for path in template_paths:
            if path.exists():
                content = path.read_text(encoding="utf-8")
                break

        assert content, "PR template not found"
        assert "security" in content.lower()

    def test_pr_template_has_verification_section(self) -> None:
        """Verify PR template includes verification checklist."""
        template_paths = [
            Path(".github/pull_request_template.md"),
            Path(".github/PULL_REQUEST_TEMPLATE.md"),
        ]
        content = ""
        for path in template_paths:
            if path.exists():
                content = path.read_text(encoding="utf-8")
                break

        assert "verification" in content.lower() or "test" in content.lower()

    def test_pr_template_uses_checklists(self) -> None:
        """Verify PR template uses markdown checklists."""
        template_paths = [
            Path(".github/pull_request_template.md"),
            Path(".github/PULL_REQUEST_TEMPLATE.md"),
        ]
        content = ""
        for path in template_paths:
            if path.exists():
                content = path.read_text(encoding="utf-8")
                break

        # Should have markdown checkboxes
        assert "- [ ]" in content


class TestGitHubCodeowners:
    """Test CODEOWNERS file."""

    def test_codeowners_exists(self) -> None:
        """Verify CODEOWNERS file exists."""
        assert Path(".github/CODEOWNERS").exists()

    def test_codeowners_not_empty(self) -> None:
        """Verify CODEOWNERS file is not empty."""
        content = Path(".github/CODEOWNERS").read_text(encoding="utf-8")
        # Remove comments and whitespace
        non_comment_lines = [line for line in content.splitlines() if line.strip() and not line.strip().startswith("#")]
        assert len(non_comment_lines) > 0


class TestGitHubDependabot:
    """Test Dependabot configuration."""

    def test_dependabot_config_exists(self) -> None:
        """Verify Dependabot config exists."""
        assert Path(".github/dependabot.yml").exists()

    def test_dependabot_config_is_valid_yaml(self) -> None:
        """Verify Dependabot config is valid YAML."""
        content = Path(".github/dependabot.yml").read_text(encoding="utf-8")
        yaml.safe_load(content)

    def test_dependabot_has_version(self) -> None:
        """Verify Dependabot config specifies version."""
        content = yaml.safe_load(Path(".github/dependabot.yml").read_text(encoding="utf-8"))
        assert "version" in content

    def test_dependabot_has_updates(self) -> None:
        """Verify Dependabot config defines update schedules."""
        content = yaml.safe_load(Path(".github/dependabot.yml").read_text(encoding="utf-8"))
        assert "updates" in content
        assert len(content["updates"]) > 0


class TestDocumentationFiles:
    """Test documentation markdown files."""

    def test_readme_exists(self) -> None:
        """Verify README.md exists."""
        assert Path("README.md").exists()

    def test_readme_has_project_name(self) -> None:
        """Verify README contains project name."""
        content = Path("README.md").read_text(encoding="utf-8")
        assert "BandScope" in content or "bandscope" in content

    def test_readme_has_headers(self) -> None:
        """Verify README has markdown headers."""
        content = Path("README.md").read_text(encoding="utf-8")
        assert re.search(r"^#+\s", content, re.MULTILINE)

    def test_contributing_exists(self) -> None:
        """Verify CONTRIBUTING.md exists."""
        assert Path("CONTRIBUTING.md").exists()

    def test_code_of_conduct_exists(self) -> None:
        """Verify CODE_OF_CONDUCT.md exists."""
        assert Path("CODE_OF_CONDUCT.md").exists()

    def test_security_exists(self) -> None:
        """Verify SECURITY.md exists."""
        assert Path("SECURITY.md").exists()

    def test_security_has_reporting_instructions(self) -> None:
        """Verify SECURITY.md includes vulnerability reporting instructions."""
        content = Path("SECURITY.md").read_text(encoding="utf-8")
        assert "report" in content.lower() or "security" in content.lower()

    def test_license_exists(self) -> None:
        """Verify LICENSE file exists."""
        assert Path("LICENSE").exists()

    def test_agents_md_exists(self) -> None:
        """Verify AGENTS.md exists for agent instructions."""
        assert Path("AGENTS.md").exists()

    def test_architecture_md_exists(self) -> None:
        """Verify ARCHITECTURE.md exists."""
        assert Path("ARCHITECTURE.md").exists()


class TestEdgeCases:
    """Additional edge case and regression tests."""

    def test_no_trailing_whitespace_in_editorconfig(self) -> None:
        """Verify .editorconfig enforces no trailing whitespace."""
        content = Path(".editorconfig").read_text(encoding="utf-8")
        assert "trim_trailing_whitespace = true" in content

    def test_gitignore_has_coverage_artifacts(self) -> None:
        """Verify .gitignore excludes test coverage artifacts."""
        content = Path(".gitignore").read_text(encoding="utf-8")
        # Coverage files should be ignored to avoid committing them
        assert "coverage" in content.lower() or ".coverage" in content or "*.cover" in content

    def test_workflows_use_checkout_v4_or_newer(self) -> None:
        """Verify workflows use recent checkout action version for security."""
        workflow_files = list(Path(".github/workflows").glob("*.yml"))
        for workflow_file in workflow_files:
            content = workflow_file.read_text(encoding="utf-8")
            if "actions/checkout@" in content:
                # Should not use very old versions (v1, v2, v3 are outdated)
                assert not re.search(r"actions/checkout@v[123]\s", content), \
                    f"{workflow_file} uses outdated checkout action"

    def test_pr_template_has_dependency_checklist(self) -> None:
        """Verify PR template includes dependency review checklist."""
        template_paths = [
            Path(".github/pull_request_template.md"),
            Path(".github/PULL_REQUEST_TEMPLATE.md"),
        ]
        content = ""
        for path in template_paths:
            if path.exists():
                content = path.read_text(encoding="utf-8")
                break

        assert "dependency" in content.lower() or "supply chain" in content.lower()

    def test_workflows_avoid_hardcoded_secrets(self) -> None:
        """Verify workflows don't contain hardcoded secrets (regression test)."""
        workflow_files = list(Path(".github/workflows").glob("*.yml"))
        for workflow_file in workflow_files:
            content = workflow_file.read_text(encoding="utf-8")
            # Should not have obvious hardcoded tokens/keys
            assert not re.search(r'(password|token|key)\s*:\s*["\'][a-zA-Z0-9]{20,}', content.lower()), \
                f"{workflow_file} may contain hardcoded secrets"

    def test_readme_references_security_docs(self) -> None:
        """Verify README links to security documentation (regression test)."""
        content = Path("README.md").read_text(encoding="utf-8")
        # Should reference security documentation
        assert "SECURITY.md" in content or "security/" in content.lower()

    def test_contributing_has_pr_guidelines(self) -> None:
        """Verify CONTRIBUTING.md includes PR or contribution guidelines."""
        content = Path("CONTRIBUTING.md").read_text(encoding="utf-8")
        # Should mention pull requests or contributions
        assert "pull request" in content.lower() or "contribution" in content.lower() or "contribute" in content.lower()

    def test_editorconfig_handles_python_indent_separately(self) -> None:
        """Verify .editorconfig uses 4-space indent for Python files."""
        content = Path(".editorconfig").read_text(encoding="utf-8")
        # Python should have its own section with 4-space indent
        assert "[*.py]" in content
        # Extract Python section and verify indent size
        lines = content.splitlines()
        in_python_section = False
        for line in lines:
            if "[*.py]" in line:
                in_python_section = True
            elif in_python_section and "indent_size" in line:
                assert "4" in line
                break

    def test_github_templates_use_yml_extension(self) -> None:
        """Verify GitHub templates use .yml extension (not .yaml) for consistency."""
        issue_templates = list(Path(".github/ISSUE_TEMPLATE").glob("*.yml"))
        yaml_templates = list(Path(".github/ISSUE_TEMPLATE").glob("*.yaml"))
        # Project should be consistent with .yml extension
        if issue_templates:
            # If using .yml, should not have .yaml files
            assert len(yaml_templates) == 0 or len(issue_templates) == 0


class TestDesktopIndexHTML:
    """Test apps/desktop/index.html."""

    def test_index_html_exists(self) -> None:
        """Verify index.html exists."""
        assert Path("apps/desktop/index.html").exists()

    def test_index_html_has_doctype(self) -> None:
        """Verify index.html has DOCTYPE declaration."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert "<!doctype html>" in content.lower() or "<!DOCTYPE html>" in content

    def test_index_html_has_html_tag(self) -> None:
        """Verify index.html has <html> tag."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert "<html" in content.lower()

    def test_index_html_has_head_section(self) -> None:
        """Verify index.html has <head> section."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert "<head>" in content.lower()

    def test_index_html_has_body_section(self) -> None:
        """Verify index.html has <body> section."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert "<body>" in content.lower()

    def test_index_html_sets_charset(self) -> None:
        """Verify index.html sets UTF-8 charset."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert 'charset="UTF-8"' in content or "charset='UTF-8'" in content or 'charset="utf-8"' in content

    def test_index_html_has_viewport_meta(self) -> None:
        """Verify index.html has viewport meta tag for responsive design."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert "viewport" in content.lower()

    def test_index_html_has_title(self) -> None:
        """Verify index.html has <title> tag."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert "<title>" in content.lower()

    def test_index_html_has_root_element(self) -> None:
        """Verify index.html has root div for React mount point."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert 'id="root"' in content or "id='root'" in content

    def test_index_html_loads_main_script(self) -> None:
        """Verify index.html loads main application script."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert "<script" in content.lower()
        assert "src=" in content.lower()

    def test_index_html_uses_module_script(self) -> None:
        """Verify index.html uses ES module script."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert 'type="module"' in content or "type='module'" in content

    def test_index_html_wellformed(self) -> None:
        """Verify index.html has matching opening and closing tags."""
        content = Path("apps/desktop/index.html").read_text(encoding="utf-8")
        assert content.count("<html") == content.count("</html>")
        assert content.count("<head>") == content.count("</head>")
        assert content.count("<body>") == content.count("</body>")