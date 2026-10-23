"""Full-client HubSign wire/transport support; no command-line entry point.

Reduced from the maintained helper: original Response, JSON encoding and
single-request transport are preserved. Historical package modes are omitted.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Mapping
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

HUBSIGN_ENDPOINT = "https://hubsign.routinehub.services/sign"
CHERRI_VERSION = "v2.3.0"


class _NoRedirectHandler(HTTPRedirectHandler):
    """Treat a signer redirect as a response rather than following it."""

    def redirect_request(self, request, response, code, msg, headers, new_url):
        return None


_NO_REDIRECT_OPENER = build_opener(_NoRedirectHandler)


class SendError(RuntimeError):
    """Raised when a reviewed payload is invalid."""


@dataclass(frozen=True)
class Response:
    status: int | None
    headers: Mapping[str, str]
    body: bytes
    error: str | None = None


def _go_json_string(value: str) -> str:
    """Match Go ``encoding/json.Marshal`` string escaping for this payload."""
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return encoded.replace("<", r"\u003c").replace(">", r"\u003e").replace("&", r"\u0026")


def json_request_body(payload: bytes, shortcut_name: str) -> bytes:
    """Encode exact XML with the pinned Cherri protocol and Go key order."""
    try:
        xml = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SendError(f"XML payload is not UTF-8: {exc}") from exc
    body = (
        '{"shortcut":'
        + _go_json_string(xml)
        + ',"shortcutName":'
        + _go_json_string(shortcut_name)
        + "}"
    )
    return body.encode("utf-8")


def post_once(
    endpoint: str,
    payload: bytes,
    shortcut_name: str,
    filename: str,
    timeout: float = 30.0,
) -> Response:
    """Issue one POST and never retry; transport failures remain ambiguous."""
    del filename
    wire_body = json_request_body(payload, shortcut_name)
    request = Request(
        endpoint,
        data=wire_body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(len(wire_body)),
            "User-Agent": f"cherri/{CHERRI_VERSION}",
        },
    )
    try:
        with _NO_REDIRECT_OPENER.open(request, timeout=timeout) as response:
            headers = {str(key): str(value) for key, value in response.headers.items()}
            return Response(int(response.status), headers, response.read())
    except HTTPError as exc:
        body = exc.read()
        headers = {str(key): str(value) for key, value in exc.headers.items()}
        return Response(int(exc.code), headers, body, f"HTTP {exc.code}")
    except (OSError, TimeoutError, URLError) as exc:
        return Response(None, {}, b"", f"ambiguous transport failure: {exc}")
