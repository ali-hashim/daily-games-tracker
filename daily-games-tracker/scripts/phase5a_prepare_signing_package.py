"""Prepare a credential-free, offline signing-review package.

This tool copies individually identified unsigned probe payloads from the
retained Phase 5A run-17 archive, verifies their recorded hashes, runs the
local structural inspector, and converts each binary plist to XML with
``plistlib`` for review. It never contacts a signer, sends a payload, signs a
Shortcut, executes a Shortcut, or reads credentials.

The output is a preparation/approval manifest. ``signing`` and ``transfer``
remain ``not performed`` until a separate human approval names an exact
payload and external signer.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import platform
import subprocess
import sys
import tempfile
from typing import Any, Iterable
import zipfile


DEFAULT_PROBES = ("02",)
ALLOWED_PROBES = {"02", "03", "04"}
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = REPO_ROOT / "tmp" / "hubsign-approved-20261022154913428" / "probes.zip"
DEFAULT_LOCK = REPO_ROOT / "daily-games-tracker" / "shortcut" / "cherri-migration" / "toolchain.lock.json"
DEFAULT_CAPTURE = REPO_ROOT / "daily-games-tracker" / "shortcut" / "capture-safari.js"
DEFAULT_INSPECTOR = REPO_ROOT / "daily-games-tracker" / "shortcut" / "cherri-migration" / "build" / "inspect-shortcut.py"


class PackageError(RuntimeError):
    """Raised when an offline package cannot be prepared safely."""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    return sha256(path.read_bytes())


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")


def parse_probes(value: str) -> list[str]:
    probes = [item.strip().zfill(2) for item in value.split(",") if item.strip()]
    if not probes or any(item not in ALLOWED_PROBES for item in probes):
        raise PackageError("Only probes 02, 03, and 04 are eligible for this compatibility package.")
    if len(set(probes)) != len(probes):
        raise PackageError("Each probe may be selected only once.")
    return probes


def _safe_member(name: str) -> str:
    path = Path(name)
    if path.is_absolute() or ".." in path.parts:
        raise PackageError(f"Archive member escapes its package scope: {name}")
    return name.replace("\\", "/")


class EvidenceSource:
    """Read a retained run directory or ZIP without modifying it."""

    def __init__(self, path: Path):
        self.path = path
        self.archive = zipfile.ZipFile(path) if path.is_file() and path.suffix.lower() == ".zip" else None
        if self.archive:
            self.names = {_safe_member(name) for name in self.archive.namelist()}
        elif path.is_dir():
            self.names = {
                _safe_member(str(file.relative_to(path)).replace("\\", "/"))
                for file in path.rglob("*")
                if file.is_file()
            }
        else:
            raise PackageError(f"Evidence input must be a ZIP or directory: {path}")

    def read(self, name: str) -> bytes:
        name = _safe_member(name)
        if name not in self.names:
            raise PackageError(f"Retained evidence is missing {name}")
        if self.archive:
            return self.archive.read(name)
        return (self.path / Path(name)).read_bytes()

    def close(self) -> None:
        if self.archive:
            self.archive.close()


def _load_json(source: EvidenceSource, name: str) -> dict[str, Any]:
    try:
        value = json.loads(source.read(name).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackageError(f"Evidence file is not valid JSON: {name}: {exc}") from exc
    if not isinstance(value, dict):
        raise PackageError(f"Evidence JSON must be an object: {name}")
    return value


def _recorded_hashes(source: EvidenceSource) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for line in source.read("SHA256SUMS").decode("utf-8").splitlines():
        fields = line.split(maxsplit=1)
        if len(fields) != 2 or len(fields[0]) != 64:
            raise PackageError(f"Malformed SHA256SUMS line: {line!r}")
        # CI wrote absolute runner paths into SHA256SUMS. Keep only the
        # basename so those paths cannot influence package output resolution.
        raw_name = fields[1].lstrip("*").replace("\\", "/")
        normalized_name = _safe_member(raw_name.rsplit("/", 1)[-1])
        digest = fields[0].lower()
        if normalized_name in hashes and hashes[normalized_name] != digest:
            raise PackageError(f"SHA256SUMS contains conflicting digests for {normalized_name}.")
        hashes[normalized_name] = digest
    return hashes


def _probe_report(source: EvidenceSource, probe: str) -> dict[str, Any]:
    report = _load_json(source, f"inspection-{probe}.json")
    if report.get("structuralChecks") != "passed":
        raise PackageError(f"Retained inspector report for probe {probe} did not pass.")
    return report


def _run_inspector(
    inspector: Path,
    payload: Path,
    probe: str,
    capture: Path,
    python_executable: str,
) -> dict[str, Any]:
    command = [python_executable, str(inspector), str(payload), "--experiment", probe]
    if probe == "04":
        command.extend(["--capture", str(capture)])
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise PackageError(f"Canonical inspector rejected probe {probe}: {detail}")
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise PackageError(f"Canonical inspector did not return JSON for probe {probe}: {exc}") from exc
    if report.get("structuralChecks") != "passed":
        raise PackageError(f"Canonical inspector did not pass probe {probe}.")
    return report


def _iter_plist_values(value: Any) -> Iterable[Any]:
    """Yield every nested plist value for the package policy checks."""
    yield value
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from _iter_plist_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_plist_values(child)


def _validate_compatibility_payload(parsed: Any, probe: str) -> None:
    """Reject transfer-like actions, URLs, and configured import defaults.

    Probes 02/03/04 are local compatibility probes. The canonical inspector
    checks their structure, while this package-level policy check makes the
    no-network and no-configured-default boundary explicit before an XML body
    is prepared for any future review.
    """
    network_action_ids = {
        "is.workflow.actions.downloadurl",
        "is.workflow.actions.getcontentsurl",
        "is.workflow.actions.getcontents of url",
        "is.workflow.actions.getcontents",
        "is.workflow.actions.openurl",
    }
    if isinstance(parsed, dict):
        for nested in _iter_plist_values(parsed):
            if isinstance(nested, dict) and nested.get("WFWorkflowActionIdentifier") in network_action_ids:
                raise PackageError(f"Probe {probe} contains a network-capable action; package preparation refused.")
        questions = parsed.get("WFWorkflowImportQuestions", [])
        for question in questions if isinstance(questions, list) else []:
            if not isinstance(question, dict):
                continue
            for key, value in question.items():
                if key.casefold() in {"defaultvalue", "wfworkflowimportquestiondefaultvalue"} and value not in (None, "", []):
                    raise PackageError(f"Probe {probe} contains a configured Import Question default; package preparation refused.")
    urls = [value for value in _iter_plist_values(parsed) if isinstance(value, str) and ("http://" in value.casefold() or "https://" in value.casefold())]
    if urls:
        raise PackageError(f"Probe {probe} contains a URL despite the no-network compatibility policy; package preparation refused.")


def _write_checksums(root: Path, relative_files: Iterable[str]) -> dict[str, str]:
    checksums: dict[str, str] = {}
    for relative_name in sorted(relative_files):
        path = root / relative_name
        if not path.is_file():
            raise PackageError(f"Package file disappeared while hashing: {relative_name}")
        checksums[relative_name] = file_sha256(path)
    lines = [f"{digest}  {name}" for name, digest in checksums.items()]
    (root / "PACKAGE-SHA256SUMS").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return checksums


def _hash_files(root: Path, relative_files: Iterable[str]) -> dict[str, str]:
    return {
        relative_name: file_sha256(root / relative_name)
        for relative_name in sorted(relative_files)
    }


def prepare_package(
    input_path: Path,
    output_path: Path,
    lock_path: Path,
    capture_path: Path,
    inspector_path: Path,
    probes: list[str],
    python_executable: str,
) -> dict[str, Any]:
    if sys.version_info[:2] != (3, 12):
        raise PackageError(f"Signing-package plist serialization requires Python 3.12; found {platform.python_version()}.")
    if output_path.exists() and any(output_path.iterdir()):
        raise PackageError(f"Output directory must be new or empty: {output_path}")
    output_path.mkdir(parents=True, exist_ok=True)
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    capture_bytes = capture_path.read_bytes()
    expected_capture = lock.get("capture", {})
    if sha256(capture_bytes) != expected_capture.get("sha256") or len(capture_bytes) != expected_capture.get("bytes"):
        raise PackageError("Maintained capture source does not match toolchain lock.")
    if not inspector_path.is_file():
        raise PackageError(f"Canonical inspector is missing: {inspector_path}")

    source = EvidenceSource(input_path)
    try:
        source_manifest = _load_json(source, "manifest.json")
        prepared_manifest = _load_json(source, "prepared-source-manifest.json")
        probe_manifest = _load_json(source, "probe-manifest.json")
        recorded_hashes = _recorded_hashes(source)
        # The retained run-17 SHA256SUMS file records only the two alert
        # artifacts.  Probe payload hashes are recorded in probe-manifest.json;
        # fold those into the same lookup so selecting probes 02–04 verifies
        # the actual retained payloads before packaging them.
        for report in probe_manifest.get("probeInspections", []):
            probe = report.get("experiment")
            digest = report.get("sha256")
            if probe not in ALLOWED_PROBES or not isinstance(digest, str) or len(digest) != 64:
                continue
            artifact_name = f"Cherri-probe-{probe}_unsigned.shortcut"
            previous = recorded_hashes.get(artifact_name)
            if previous is not None and previous != digest.lower():
                raise PackageError(f"Retained hash manifests disagree for {artifact_name}.")
            recorded_hashes[artifact_name] = digest.lower()
        archive_hash = file_sha256(input_path) if input_path.is_file() else None
        expected_archive_hash = lock.get("latestUnsignedExperiment", {}).get("artifactSha256")
        if archive_hash and expected_archive_hash and archive_hash != expected_archive_hash:
            raise PackageError("Run-17 archive SHA-256 differs from the toolchain lock.")
        if prepared_manifest.get("compiler", {}).get("commit") != lock.get("compiler", {}).get("commit"):
            raise PackageError("Prepared source compiler commit differs from the lock.")
        if prepared_manifest.get("go", {}).get("version") != lock.get("go", {}).get("version"):
            raise PackageError("Prepared source Go version differs from the lock.")
        if prepared_manifest.get("capture", {}).get("sha256") != expected_capture.get("sha256"):
            raise PackageError("Prepared source capture hash differs from the lock.")

        package_files: list[str] = []
        package_probes: list[dict[str, Any]] = []
        # Keep the transient inspector input under the caller-selected ignored
        # output directory; the managed Windows runtime may deny its sandbox
        # temp directory to a child Python process.
        with tempfile.TemporaryDirectory(prefix=".phase5a-signing-", dir=output_path) as temporary:
            for probe in probes:
                artifact_name = f"Cherri-probe-{probe}_unsigned.shortcut"
                artifact_bytes = source.read(artifact_name)
                actual_sha = sha256(artifact_bytes)
                if recorded_hashes.get(artifact_name) != actual_sha:
                    raise PackageError(f"SHA256SUMS mismatch for {artifact_name}.")
                retained_report = _probe_report(source, probe)
                if retained_report.get("sha256") != actual_sha:
                    raise PackageError(f"Retained inspector hash mismatch for {artifact_name}.")
                reports = probe_manifest.get("probeInspections", [])
                matching_reports = [report for report in reports if report.get("experiment") == probe and report.get("sha256") == actual_sha]
                if not matching_reports:
                    raise PackageError(f"probe-manifest.json has no matching inspection for probe {probe}.")

                temporary_payload = Path(temporary) / artifact_name
                temporary_payload.write_bytes(artifact_bytes)
                inspection = _run_inspector(inspector_path, temporary_payload, probe, capture_path, python_executable)
                if inspection.get("sha256") != actual_sha:
                    raise PackageError(f"Fresh inspector hash mismatch for {artifact_name}.")

                probe_dir = output_path / "probes" / probe
                probe_dir.mkdir(parents=True, exist_ok=True)
                binary_relative = f"probes/{probe}/{artifact_name}"
                binary_path = output_path / binary_relative
                binary_path.write_bytes(artifact_bytes)
                parsed = plistlib.loads(artifact_bytes)
                _validate_compatibility_payload(parsed, probe)
                xml_bytes = plistlib.dumps(parsed, fmt=plistlib.FMT_XML)
                if plistlib.loads(xml_bytes) != parsed:
                    raise PackageError(f"plistlib XML round-trip failed for probe {probe}.")
                xml_relative = f"probes/{probe}/{artifact_name[:-len('.shortcut')]}.xml"
                (output_path / xml_relative).write_bytes(xml_bytes)
                inspection_relative = f"probes/{probe}/inspection.json"
                (output_path / inspection_relative).write_bytes(json_bytes(inspection))
                package_files.extend([binary_relative, xml_relative, inspection_relative])
                package_probes.append(
                    {
                        "id": probe,
                        "artifact": {
                            "path": binary_relative,
                            "bytes": len(artifact_bytes),
                            "sha256": actual_sha,
                            "signing": "not performed",
                        },
                        "xml": {
                            "path": xml_relative,
                            "bytes": len(xml_bytes),
                            "sha256": sha256(xml_bytes),
                            "plistlibRoundTrip": True,
                        },
                        "futureSigningPayload": {
                            "path": xml_relative,
                            "format": "XML property list; exact bytes are the prospective JSON shortcut field value",
                            "bytes": len(xml_bytes),
                            "sha256": sha256(xml_bytes),
                            "transport": "Cherri HubSign JSON: {shortcutName, shortcut}; full request body is serialized by the sender",
                            "goSerializerEquivalence": "not established",
                        },
                        "canonicalInspector": {
                            "path": str(inspector_path.relative_to(REPO_ROOT)).replace("\\", "/") if inspector_path.is_relative_to(REPO_ROOT) else inspector_path.name,
                            "sha256": file_sha256(inspector_path),
                            "reportPath": inspection_relative,
                            "structuralChecks": inspection.get("structuralChecks"),
                            "nativeExecution": inspection.get("nativeExecution", "not performed"),
                        },
                        "approval": "separate explicit external-transfer approval required",
                    }
                )

        provenance = {
            "run17Manifest": source_manifest,
            "preparedSourceManifest": prepared_manifest,
            "probeManifest": probe_manifest,
        }
        provenance_relative = "provenance/run17-manifests.json"
        provenance_path = output_path / provenance_relative
        provenance_path.parent.mkdir(parents=True, exist_ok=True)
        provenance_path.write_bytes(json_bytes(provenance))
        package_files.append(provenance_relative)
        manifest = {
            "schemaVersion": 1,
            "status": "offline signing-review package prepared; no transfer or signing performed",
            "approval": "not requested",
            "signing": "not performed",
            "transfer": "not performed",
            "nativeExecution": "not performed by this package step",
            "input": {
                "name": input_path.name,
                "kind": "zip" if input_path.is_file() else "directory",
                "sha256": archive_hash,
                "expectedRun17Sha256": expected_archive_hash,
                "applicationCommit": lock.get("latestUnsignedExperiment", {}).get("applicationCommit"),
            },
            "toolchain": {
                "lockPath": str(lock_path.relative_to(REPO_ROOT)).replace("\\", "/") if lock_path.is_relative_to(REPO_ROOT) else lock_path.name,
                "lockSha256": file_sha256(lock_path),
                "compiler": lock.get("compiler"),
                "go": lock.get("go"),
                "runner": lock.get("build", {}).get("runner"),
                "flags": lock.get("build", {}).get("flags"),
            },
            "capture": {
                "path": str(capture_path.relative_to(REPO_ROOT)).replace("\\", "/") if capture_path.is_relative_to(REPO_ROOT) else capture_path.name,
                "bytes": len(capture_bytes),
                "sha256": sha256(capture_bytes),
            },
            "serialization": {
                "pythonVersion": platform.python_version(),
                "implementation": platform.python_implementation(),
                "plistlib": "plistlib.loads(binary) -> plistlib.dumps(FMT_XML) -> plistlib.loads(XML)",
                "inspectorPython": Path(python_executable).name,
                "goSerializerEquivalence": "not established",
            },
            "probes": package_probes,
            "provenance": provenance_relative,
            "packageChecksums": "PACKAGE-SHA256SUMS",
        }
        manifest_relative = "approval-manifest.json"
        manifest["packageFileHashes"] = _hash_files(output_path, package_files)
        (output_path / manifest_relative).write_bytes(json_bytes(manifest))
        _write_checksums(output_path, package_files + [manifest_relative])
        return manifest
    finally:
        source.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Retained run-17 probes ZIP or extracted directory.")
    parser.add_argument("--output", type=Path, required=True, help="New or empty ignored output directory.")
    parser.add_argument("--probes", default=",".join(DEFAULT_PROBES), help="Comma-separated individually identified probes: 02,03,04.")
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK)
    parser.add_argument("--capture", type=Path, default=DEFAULT_CAPTURE)
    parser.add_argument("--inspector", type=Path, default=DEFAULT_INSPECTOR)
    parser.add_argument("--python", default=sys.executable, help="Python executable used to run the canonical inspector.")
    args = parser.parse_args()
    try:
        manifest = prepare_package(
            args.input.resolve(),
            args.output.resolve(),
            args.lock.resolve(),
            args.capture.resolve(),
            args.inspector.resolve(),
            parse_probes(args.probes),
            args.python,
        )
    except (OSError, PackageError, plistlib.InvalidFileException, ValueError, zipfile.BadZipFile) as exc:
        parser.error(str(exc))
    print(json.dumps({"output": str(args.output.resolve()), "probes": [probe["id"] for probe in manifest["probes"]], "status": manifest["status"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
