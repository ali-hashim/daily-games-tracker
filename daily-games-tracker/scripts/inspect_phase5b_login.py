"""Offline, credential-free inspection of the maintained Phase 5B source.

No network, compilation, signing, configured artifacts, or native execution.
Hashes pin reviewed source regions (LF normalized), not generated native actions.
Run with --self-test to exercise rejection of synthetic source regressions.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "shortcut/cherri-migration/source/upload-to-wht.cherri"
ORIGIN = "https://preview.winstitute-of-higher-thinking.pages.dev"
PREFIX = "DGT_LOGIN_V1:"
# Accepted upload tail, with only its obsolete login-unavailable guard removed.
UPLOAD_SHA = "7ff5c843a8e0f7a5cbf4ff0bf730975b0703479a3f1a1f16ce68360443d19f35"
SETUP_SHA = "ce49df7a86019b643ef27da2c3dafb1ababed7cefca46ab503f1f74a98db8fca"
LOGIN_SHA = "dcd2287a5a929db2aa28ca5588e9e03fe6241bde6bdd200c99be15b156592477"


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def inspect(source: str) -> dict:
    source = source.replace("\r\n", "\n")
    start = source.find("// Login is dispatched")
    end = source.find("const inputType =")
    require(0 < start < end, "Login must precede upload type/capture routing")
    setup, login, upload = source[:start], source[start:end], source[end:]
    require(digest(setup) == SETUP_SHA, "Accepted input/setup/action bindings changed")
    require(digest(upload) == UPLOAD_SHA, "Accepted upload behavior changed")
    require('if loginInput beginsWith "DGT_LOGIN_V1:" {' in login, "Missing first-prefix dispatch")
    require('replaceText("^DGT_LOGIN_V1:", "", loginInput, true, true)' in login,
            "Must remove only the leading prefix")
    require('@loginBody = {"challenge":"{loginChallenge}"}' in login,
            "Approval must contain exactly the runtime challenge Text field")
    request = f'whtPostJsonText("{ORIGIN}/api/auth/device/approve", loginJson, {{"Content-Type":"application/json", "Authorization":"Device {{authorizationCode}}"}})'
    require(login.count(request) == 1 and login.count("whtPostJsonText(") == 1,
            "Must send exactly one approval with the accepted runtime credential")
    require('item "Cancel":\n            stop()\n        item "Approve Login":' in login,
            "Cancel must stop before any approval")
    return_read = '@loginReturnURL = getValue(@loginResponse, "return_url")'
    require(login.count(return_read) == 1,
            "Approved login must read exactly one runtime return_url")
    require(login.count("whtOpenURL(") == 1 and "whtOpenURL(@loginReturnURL)" in login,
            "Return to WHT must open the runtime return_url through Safari")
    require('whtOpenURL("' not in login,
            "Return to WHT must not use a hard-coded URL")
    require('item "Close":\n                        stop()' in login,
            "Close branch must stop")
    require('item "Return to WHT":\n                        whtOpenURL(@loginReturnURL)\n                        stop()' in login,
            "Return to WHT branch must stop")
    require(login.rstrip().endswith("stop()\n}"), "Login must end with a fail-closed stop")
    for forbidden in ("setClipboard(", "whtExactCapture(", "/api/import/", "Cookie", "install_url"):
        require(forbidden not in login, "Forbidden login side effect or credential field")
    # Pin the complete reviewed branch, including error/unknown handling, nesting,
    # approved-login menu and every explicit stop. This
    # intentionally rejects edits until their control flow is reviewed again.
    require(digest(login) == LOGIN_SHA, "Reviewed login control flow changed")
    return {
        "status": "static source contract passed",
        "sourceSha256": digest(source),
        "uploadSha256": digest(upload),
        "checks": ["preserved original input and trimmed runtime credential",
                   "first-prefix routing and anchored removal", "exact approval request",
                   "Cancel without request", "approved Safari return menu",
                   "error/unknown explicit stops", "no login capture/upload/clipboard fall-through",
                   "accepted upload tail preserved"],
        "generatedActionInspection": "not performed",
        "nativeExecution": "unproved",
        "signing": "not performed; unproved",
        "transportFailure": "native action abort expected; iPhone proof required",
    }


def self_test(source: str) -> int:
    mutations = [
        ('beginsWith "DGT_LOGIN_V1:"', 'contains "DGT_LOGIN_V1:"'),
        ('"^DGT_LOGIN_V1:"', '"DGT_LOGIN_V1:"'),
        ('{"challenge":"{loginChallenge}"}', '{"challenge":"{loginChallenge}", "version":1}'),
        ('loginJson, {"Content-Type"', 'requestJson, {"Content-Type"'),
        ('/api/auth/device/approve', '/api/import/submit'),
        ('item "Cancel":\n            stop()', 'item "Cancel":\n            alert("Cancelled")'),
        ('@loginReturnURL = getValue(@loginResponse, "return_url")\n', ''),
        ('whtOpenURL(@loginReturnURL)', 'whtOpenURL("https://example.invalid/hard-coded")'),
        ('whtOpenURL(@loginReturnURL)\n                        stop()', 'whtOpenURL(@loginReturnURL)'),
        ('item "Close":\n                        stop()', 'item "Close":\n                        alert("Closed")'),
        ('if loginStatus == "error"', 'if loginStatus == "approved"'),
        ('const loginInput = getText(@originalInput)', 'const loginInput = getText(Clipboard)'),
        ('const loginJson = getText(@loginBody)', 'setClipboard(loginChallenge)\n            const loginJson = getText(@loginBody)'),
        ('const inputType = typeOf(@originalInput)', 'const inputType = typeOf(loginInput)'),
        ('#question deviceQuestion "Paste your private WHT device code." ""', '#question deviceQuestion "Paste your private WHT device code." "synthetic"'),
    ]
    for before, after in mutations:
        require(before in source, "Self-test mutation target missing")
        try:
            inspect(source.replace(before, after, 1))
        except ValueError:
            continue
        raise ValueError("Inspector accepted a synthetic regression")
    # Synthetic dispatch examples describe source semantics, not native execution.
    for value, expected in ((PREFIX + "synthetic", True), (PREFIX, True),
                            (" " + PREFIX, False), ("game " + PREFIX, False),
                            ("shared game text", False)):
        require(value.startswith(PREFIX) == expected, "Synthetic prefix fixture failed")
    repeated = PREFIX + "synthetic:" + PREFIX
    require(repeated.removeprefix(PREFIX) == "synthetic:" + PREFIX,
            "Only one leading prefix may be removed")
    return len(mutations)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    try:
        source = args.source.read_text(encoding="utf-8")
        report = inspect(source)
        if args.self_test:
            report["rejectedSyntheticRegressions"] = self_test(source)
            report["syntheticPrefixFixtures"] = 6
        print(json.dumps(report, indent=2))
        return 0
    except (OSError, ValueError):
        # Never echo source or input values on failure.
        print(json.dumps({"status": "static inspection failed", "nativeExecution": "unproved"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
