"""Fail-closed client for the durable private signing worker.

The worker is the durable signer boundary. CI sends one validated, origin-bearing
wire request over HTTPS and receives receipt metadata only. The worker atomically
claims the stable source-plus-target key, rejects immutable metadata conflicts,
performs one HubSign transfer, and persists the signed bytes before responding.
This client never retries, follows redirects, or logs response bodies. A completed signed Shortcut can be recovered only to an explicit private output path after its durable hash is verified.
"""
from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import os
import tempfile
from typing import Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from phase5a_build_upload import validate_runtime_origin


class ReceiptError(RuntimeError):
    """The private durable signing contract was not proven."""


class ImmutableConflict(ReceiptError):
    """The stable operation key already has different immutable metadata."""


# Compatibility name for callers that used the old lease terminology.
DuplicateLease = ImmutableConflict


@dataclass(frozen=True)
class Response:
    status: int | None
    headers: Mapping[str, str]
    body: bytes
    error: str | None = None


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, msg, headers, new_url):
        return None


_OPENER = build_opener(_NoRedirectHandler)
Transport = Callable[[str, str, dict], Response]


def _validate_endpoint(endpoint: str) -> str:
    if not isinstance(endpoint, str) or not endpoint or endpoint != endpoint.strip():
        raise ReceiptError("private signing endpoint is not a valid HTTPS URL")
    parsed = urlsplit(endpoint)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ReceiptError("private signing endpoint is not a valid HTTPS URL")
    return endpoint


def _validate_token(token: str) -> str:
    if not isinstance(token, str) or not token or token != token.strip():
        raise ReceiptError("private signing token is not configured")
    return token


def _validate_hex(value: str, length: int, label: str) -> str:
    if not isinstance(value, str) or len(value) != length or any(c not in "0123456789abcdef" for c in value):
        raise ReceiptError(f"{label} is not a lowercase hexadecimal digest")
    return value


def _validate_commit(commit: str) -> str:
    return _validate_hex(commit, 40, "source commit")


def operation_key(source_commit: str, target_origin_sha256: str) -> str:
    """Derive a stable logical source/target key, independent of provenance."""
    source_commit = _validate_commit(source_commit)
    target_origin_sha256 = _validate_hex(target_origin_sha256, 64, "target origin SHA-256")
    material = f"wht-shortcut-signing-v2\n{source_commit}\n{target_origin_sha256}".encode("ascii")
    return hashlib.sha256(material).hexdigest()


def _post_json(endpoint: str, token: str, payload: dict, timeout: float = 30.0) -> Response:
    body = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()
    request = Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
            "User-Agent": "wht-shortcut-signing/2",
        },
    )
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            headers = {str(key): str(value) for key, value in response.headers.items()}
            return Response(int(response.status), headers, response.read())
    except HTTPError as exc:
        # The body may contain private endpoint details; preserve only status.
        try:
            exc.read()
        except OSError:
            pass
        return Response(int(exc.code), {}, b"", f"HTTP {exc.code}")
    except (OSError, TimeoutError, URLError):
        return Response(None, {}, b"", "ambiguous private signing transport failure")


def _decode(response: Response) -> dict:
    if response.status is None:
        raise ReceiptError(response.error or "private signing response is ambiguous")
    try:
        value = json.loads(response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ReceiptError("private signing returned non-JSON data") from exc
    if not isinstance(value, dict):
        raise ReceiptError("private signing returned a non-object response")
    return value


def sign_wire(
    endpoint: str,
    token: str,
    source_commit: str,
    runtime_origin: str,
    manifest_sha256: str,
    wire_sha256: str,
    wire: bytes,
    *,
    transport: Transport = _post_json,
) -> dict:
    """Ask the durable private worker to sign exactly one immutable wire."""
    endpoint = _validate_endpoint(endpoint)
    token = _validate_token(token)
    source_commit = _validate_commit(source_commit)
    try:
        runtime_origin = validate_runtime_origin(runtime_origin, allow_fixture=False)
    except (TypeError, ValueError) as exc:
        raise ReceiptError("runtime origin is not an approved protected origin") from exc
    manifest_sha256 = _validate_hex(manifest_sha256, 64, "manifest SHA-256")
    wire_sha256 = _validate_hex(wire_sha256, 64, "wire SHA-256")
    if not isinstance(wire, bytes) or hashlib.sha256(wire).hexdigest() != wire_sha256:
        raise ReceiptError("HubSign wire bytes do not match the approved wire digest")

    target_origin_sha256 = hashlib.sha256(runtime_origin.encode("utf-8")).hexdigest()
    key = operation_key(source_commit, target_origin_sha256)
    payload = {
        "schemaVersion": 2,
        "operation": "wht-shortcut-signing",
        "status": "sign",
        "idempotencyKey": key,
        "sourceCommit": source_commit,
        "targetOriginSha256": target_origin_sha256,
        "manifestSha256": manifest_sha256,
        "wireSha256": wire_sha256,
        "shortcutName": "Upload To WHT",
        "hubsignWireBase64": base64.b64encode(wire).decode("ascii"),
    }
    response = transport(endpoint, token, payload)
    if response.status in (409, 423):
        raise ImmutableConflict("private signing operation already exists or conflicts")
    value = _decode(response)
    if value.get("status") in {"already-complete", "already-claimed", "lease-conflict", "conflict"}:
        raise ImmutableConflict("private signing operation already exists or conflicts")
    if response.status not in (200, 201) or value.get("status") != "completed":
        raise ReceiptError("private durable signing was not completed")

    echoed_key = value.get("idempotencyKey")
    if not isinstance(echoed_key, str) or echoed_key != key:
        raise ReceiptError("private signing response did not explicitly echo the exact idempotency key")
    _validate_hex(echoed_key, 64, "response idempotency key")
    receipt_id = value.get("durableReceiptId")
    if not isinstance(receipt_id, str) or not receipt_id or receipt_id != receipt_id.strip():
        raise ReceiptError("private signing response omitted a durable receipt identifier")
    signed_sha256 = _validate_hex(value.get("signedShortcutSha256"), 64, "signed Shortcut SHA-256")
    return {
        "idempotencyKey": echoed_key,
        "durableReceiptId": receipt_id,
        "signedShortcutSha256": signed_sha256,
    }


RecoveryTransport = Callable[[str, str, str], Response]


def _recovery_endpoint(endpoint: str) -> str:
    parsed = urlsplit(endpoint)
    path = parsed.path[:-len("/sign")] + "/recover" if parsed.path.endswith("/sign") else parsed.path.rstrip("/") + "/recover"
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def _get_recovery(endpoint: str, token: str, idempotency_key: str, timeout: float = 30.0) -> Response:
    recovery_url = f"{_recovery_endpoint(endpoint)}?idempotencyKey={idempotency_key}"
    request = Request(
        recovery_url,
        method="GET",
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "wht-shortcut-signing/2",
        },
    )
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            headers = {str(key): str(value) for key, value in response.headers.items()}
            return Response(int(response.status), headers, response.read())
    except HTTPError as exc:
        try:
            exc.read()
        except OSError:
            pass
        return Response(int(exc.code), {}, b"", f"HTTP {exc.code}")
    except (OSError, TimeoutError, URLError):
        return Response(None, {}, b"", "ambiguous private recovery transport failure")


def _header(headers: Mapping[str, str], name: str) -> str | None:
    lowered = name.lower()
    for key, value in headers.items():
        if key.lower() == lowered:
            return value
    return None


def recover_signed(
    endpoint: str,
    token: str,
    idempotency_key: str,
    expected_signed_sha256: str,
    output: Path,
    *,
    transport: RecoveryTransport = _get_recovery,
) -> dict:
    """Recover durable signed bytes to a private path without invoking HubSign."""
    endpoint = _validate_endpoint(endpoint)
    token = _validate_token(token)
    idempotency_key = _validate_hex(idempotency_key, 64, "idempotency key")
    expected_signed_sha256 = _validate_hex(expected_signed_sha256, 64, "signed Shortcut SHA-256")
    if not isinstance(output, Path) or output.name in ("", ".", ".."):
        raise ReceiptError("private recovery output path is invalid")
    response = transport(endpoint, token, idempotency_key)
    if response.status in (409, 423):
        raise ImmutableConflict("private signing operation is not recoverable")
    if response.status != 200:
        raise ReceiptError("private signed Shortcut recovery was not completed")
    if (_header(response.headers, "content-type") or "").split(";", 1)[0].strip().lower() != "application/octet-stream":
        raise ReceiptError("private recovery returned an unexpected content type")
    if _header(response.headers, "cache-control") != "no-store":
        raise ReceiptError("private recovery did not disable caching")
    if _header(response.headers, "x-wht-idempotency-key") != idempotency_key:
        raise ReceiptError("private recovery did not explicitly echo the exact idempotency key")
    if _header(response.headers, "x-wht-signed-sha256") != expected_signed_sha256:
        raise ReceiptError("private recovery returned an unexpected signed Shortcut hash")
    if hashlib.sha256(response.body).hexdigest() != expected_signed_sha256:
        raise ReceiptError("private recovery bytes do not match the durable signed Shortcut hash")
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix=f".{output.name}.", dir=output.parent, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(response.body)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, output)
    except OSError as exc:
        raise ReceiptError("private signed Shortcut could not be persisted") from exc
    finally:
        if temporary_path is not None and temporary_path.exists():
            try:
                temporary_path.unlink()
            except OSError:
                pass
    return {
        "idempotencyKey": idempotency_key,
        "signedShortcutSha256": expected_signed_sha256,
        "byteLength": len(response.body),
    }


def sign(
    endpoint: str,
    token: str,
    source_commit: str,
    runtime_origin: str,
    package: Path,
    expected_manifest: str,
    expected_wire: str,
    *,
    transport: Transport = _post_json,
) -> dict:
    """Validate the frozen package, then submit only its wire to the worker."""
    from phase5a_upload_signing import validate

    validate(package, expected_manifest, expected_wire, runtime_origin=runtime_origin)
    wire = (package / "hubsign-request.json").read_bytes()
    return sign_wire(
        endpoint,
        token,
        source_commit,
        runtime_origin,
        expected_manifest,
        expected_wire,
        wire,
        transport=transport,
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--token-env", default="WHT_SIGNING_RECEIPT_TOKEN")
    sub = parser.add_subparsers(dest="status", required=True)
    sign_parser = sub.add_parser("sign")
    sign_parser.add_argument("--source-commit", required=True)
    sign_parser.add_argument("--runtime-origin", required=True)
    sign_parser.add_argument("--package", type=Path, required=True)
    sign_parser.add_argument("--expected-manifest-sha256", required=True)
    sign_parser.add_argument("--expected-wire-sha256", required=True)
    recover_parser = sub.add_parser("recover")
    recover_parser.add_argument("--idempotency-key", required=True)
    recover_parser.add_argument("--expected-signed-sha256", required=True)
    recover_parser.add_argument("--output", type=Path, required=True)
    return parser


def main() -> int:
    import os

    args = _parser().parse_args()
    token = os.environ.get(args.token_env, "")
    try:
        if args.status == "sign":
            result = sign(
                args.endpoint,
                token,
                args.source_commit,
                args.runtime_origin,
                args.package,
                args.expected_manifest_sha256,
                args.expected_wire_sha256,
            )
        else:
            result = recover_signed(
                args.endpoint,
                token,
                args.idempotency_key,
                args.expected_signed_sha256,
                args.output,
            )
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ReceiptError):
        print("private signing operation failed", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
