from __future__ import annotations

from pathlib import Path
import hashlib
import os
import platform
import zipfile


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def expected_binary_path(repo_root: Path) -> Path:
    system = platform.system().lower()
    binary_name = (
        "bandscope-desktop.exe" if system == "windows" else "bandscope-desktop"
    )
    return (
        repo_root
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / "release"
        / binary_name
    )


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    binary_path = expected_binary_path(repo_root)
    frontend_dist = repo_root / "apps" / "desktop" / "dist"
    output_dir = repo_root / "artifacts"
    output_dir.mkdir(parents=True, exist_ok=True)

    if not binary_path.exists():
        raise FileNotFoundError(f"Missing built binary: {binary_path}")
    if not frontend_dist.exists():
        raise FileNotFoundError(f"Missing frontend dist directory: {frontend_dist}")

    metadata_paths = [
        repo_root / "services" / "analysis-engine" / "uv.lock",
        repo_root / "package-lock.json",
        repo_root / "apps" / "desktop" / "src-tauri" / "Cargo.lock",
        repo_root / "supply-chain" / "supplemental-component-inventory.json",
    ]
    missing_metadata = [str(path) for path in metadata_paths if not path.exists()]
    if missing_metadata:
        missing_list = ", ".join(missing_metadata)
        raise FileNotFoundError(f"Missing release metadata files: {missing_list}")

    git_sha = os.environ.get("GITHUB_SHA", "local")[:12]
    system = platform.system().lower()
    archive_name = f"bandscope-{system}-{git_sha}.zip"
    archive_path = output_dir / archive_name

    with zipfile.ZipFile(
        archive_path, "w", compression=zipfile.ZIP_DEFLATED
    ) as archive:
        archive.write(binary_path, arcname=f"bin/{binary_path.name}")
        for path in frontend_dist.rglob("*"):
            if path.is_file():
                archive.write(
                    path,
                    arcname=str(Path("frontend") / path.relative_to(frontend_dist)),
                )
        for extra_path in metadata_paths:
            archive.write(extra_path, arcname=str(Path("metadata") / extra_path.name))

    checksum_path = output_dir / f"{archive_name}.sha256"
    checksum_path.write_text(
        f"{sha256_file(archive_path)}  {archive_name}\n", encoding="utf-8"
    )

    manifest_path = output_dir / f"bandscope-{system}-{git_sha}.manifest.txt"
    manifest_path.write_text(
        "\n".join(
            [
                f"platform={system}",
                f"binary={binary_path.name}",
                f"archive={archive_name}",
                f"checksum={checksum_path.name}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    print(str(archive_path.relative_to(repo_root)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
