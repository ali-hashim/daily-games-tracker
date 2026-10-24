"""Focused source-contract tests for the Phase 5B login return branch."""

from __future__ import annotations

from pathlib import Path
import re
import sys
import unittest


SOURCE = Path(__file__).resolve().parents[2] / "shortcut/cherri-migration/source/upload-to-wht.cherri"
SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from inspect_phase5b_login import inspect  # noqa: E402


class Phase5BLoginReturnTests(unittest.TestCase):
    def source(self) -> str:
        return SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n")

    def test_approved_login_offers_server_return_url_in_safari_menu(self) -> None:
        source = self.source()
        start = source.index("// Login is dispatched")
        end = source.index("const inputType =", start)
        login = source[start:end]

        self.assertEqual(login.count('getValue(@loginResponse, "return_url")'), 1)
        self.assertIn('item "Return to WHT":', login)
        self.assertRegex(
            login,
            r'item "Return to WHT":\s+whtOpenURL\(@loginReturnURL\)\s+stop\(\)',
        )
        self.assertRegex(login, r'item "Close":\s+stop\(\)')

    def test_phase5b_inspector_accepts_the_reviewed_return_branch(self) -> None:
        report = inspect(self.source())
        self.assertIn("approved Safari return menu", report["checks"])

    def test_phase5b_inspector_rejects_missing_return_target(self) -> None:
        mutated = self.source().replace(
            '@loginReturnURL = getValue(@loginResponse, "return_url")\n',
            "",
            1,
        )
        with self.assertRaisesRegex(ValueError, "runtime return_url"):
            inspect(mutated)

    def test_phase5b_inspector_rejects_hard_coded_return_target(self) -> None:
        mutated = self.source().replace(
            "whtOpenURL(@loginReturnURL)",
            'whtOpenURL("https://example.invalid/hard-coded")',
            1,
        )
        with self.assertRaisesRegex(ValueError, "runtime return_url"):
            inspect(mutated)

    def test_phase5b_inspector_rejects_return_fall_through(self) -> None:
        mutated = self.source().replace(
            "whtOpenURL(@loginReturnURL)\n                        stop()",
            "whtOpenURL(@loginReturnURL)",
            1,
        )
        with self.assertRaisesRegex(ValueError, "Return to WHT branch must stop"):
            inspect(mutated)

    def test_phase5b_inspector_rejects_close_fall_through(self) -> None:
        mutated = self.source().replace(
            'item "Close":\n                        stop()',
            'item "Close":\n                        alert("Closed")',
            1,
        )
        with self.assertRaisesRegex(ValueError, "Close branch must stop"):
            inspect(mutated)


if __name__ == "__main__":
    unittest.main()
