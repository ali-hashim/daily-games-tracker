"""Protocol tests for the durable private signing worker boundary."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from phase5a_private_receipt import (  # noqa: E402
    ImmutableConflict,
    ReceiptError,
    Response,
    operation_key,
    recover_signed,
    sign_wire,
)


SOURCE_COMMIT = "a" * 40
TARGET_ORIGIN = "https://wht.example.com"
MANIFEST_SHA = "b" * 64
WIRE = b'{"shortcut":"synthetic"}'
WIRE_SHA = hashlib.sha256(WIRE).hexdigest()


class _DurableWorker:
    """Self-contained worker double with durable records and one signer."""

    def __init__(self):
        self.records = {}
        self.signer_count = 0
        self.calls = []
        self.drop_first_response = False

    def post(self, url, token, payload):
        self.calls.append((url, token, payload))
        key = payload["idempotencyKey"]
        metadata = {
            field: payload[field]
            for field in (
                "sourceCommit",
                "targetOriginSha256",
                "manifestSha256",
                "wireSha256",
            )
        }
        existing = self.records.get(key)
        if existing is not None:
            if existing["metadata"] != metadata:
                return Response(409, {"Content-Type": "application/json"}, b"{}")
            response = existing["response"]
            if self.drop_first_response:
                self.drop_first_response = False
                return Response(None, {}, b"", "ambiguous completion transport failure")
            return Response(200, {"Content-Type": "application/json"}, json.dumps(response).encode())

        self.signer_count += 1
        signed_bytes = b"synthetic-signed-shortcut"
        response = {
            "status": "completed",
            "idempotencyKey": key,
            "durableReceiptId": "receipt-1",
            "signedShortcutSha256": hashlib.sha256(signed_bytes).hexdigest(),
        }
        self.records[key] = {
            "metadata": metadata,
            "response": response,
            "signed_bytes": signed_bytes,
        }
        if self.drop_first_response:
            self.drop_first_response = False
            return Response(None, {}, b"", "ambiguous completion transport failure")
        return Response(201, {"Content-Type": "application/json"}, json.dumps(response).encode())

    def get_recovery(self, url, token, key):
        record = self.records.get(key)
        if record is None:
            return Response(404, {"Content-Type": "application/json"}, b"{}")
        if record.get("ambiguous"):
            return Response(409, {"Content-Type": "application/json"}, b"{}")
        return Response(
            200,
            {
                "Content-Type": "application/octet-stream",
                "Cache-Control": "no-store",
                "X-WHT-Idempotency-Key": key,
                "X-WHT-Signed-Sha256": hashlib.sha256(record["signed_bytes"]).hexdigest(),
            },
            record["signed_bytes"],
        )


class ReceiptClientTests(unittest.TestCase):
    def setUp(self):
        self.worker = _DurableWorker()
        self.transport = self.worker.post
        self.endpoint = "https://private.example/receipt"

    def sign(self, **overrides):
        values = {
            "endpoint": self.endpoint,
            "token": "token",
            "source_commit": SOURCE_COMMIT,
            "runtime_origin": TARGET_ORIGIN,
            "manifest_sha256": MANIFEST_SHA,
            "wire_sha256": WIRE_SHA,
            "wire": WIRE,
            "transport": self.transport,
        }
        values.update(overrides)
        return sign_wire(**values)

    def test_stable_key_recovers_after_completion_transport_failure_without_resigning(self):
        self.worker.drop_first_response = True
        with self.assertRaises(ReceiptError):
            self.sign()
        self.assertEqual(self.worker.signer_count, 1)

        receipt = self.sign()
        expected_key = operation_key(SOURCE_COMMIT, hashlib.sha256(TARGET_ORIGIN.encode()).hexdigest())
        self.assertEqual(receipt["idempotencyKey"], expected_key)
        self.assertEqual(receipt["durableReceiptId"], "receipt-1")
        self.assertEqual(
            self.worker.records[expected_key]["signed_bytes"],
            b"synthetic-signed-shortcut",
        )
        self.assertEqual(self.worker.signer_count, 1)

    def test_changed_provenance_or_wire_conflicts_with_existing_logical_operation(self):
        self.sign()
        with self.assertRaises(ImmutableConflict):
            self.sign(manifest_sha256="d" * 64)
        changed_wire = b'{"shortcut":"changed"}'
        with self.assertRaises(ImmutableConflict):
            self.sign(wire=changed_wire, wire_sha256=hashlib.sha256(changed_wire).hexdigest())
        self.assertEqual(self.worker.signer_count, 1)

    def test_missing_wrong_and_malformed_echoed_keys_fail_closed(self):
        responses = (
            {"status": "completed", "durableReceiptId": "r", "signedShortcutSha256": "c" * 64},
            {"status": "completed", "idempotencyKey": "wrong", "durableReceiptId": "r", "signedShortcutSha256": "c" * 64},
            {"status": "completed", "idempotencyKey": "z" * 63, "durableReceiptId": "r", "signedShortcutSha256": "c" * 64},
        )
        for response in responses:
            with self.subTest(response=response):
                def malformed(url, token, payload, response=response):
                    return Response(200, {"Content-Type": "application/json"}, json.dumps(response).encode())

                with self.assertRaises(ReceiptError):
                    self.sign(transport=malformed)

    def test_reserved_placeholder_origin_is_rejected_before_private_call(self):
        for origin in ("https://runtime.example.invalid", "https://service.example", "https://localhost"):
            with self.subTest(origin=origin), self.assertRaises(ReceiptError):
                self.sign(runtime_origin=origin)
        self.assertEqual(self.worker.calls, [])

    def test_non_https_endpoint_is_rejected_before_private_call(self):
        with self.assertRaises(ReceiptError):
            self.sign(endpoint="http://private.example/receipt")
        self.assertEqual(self.worker.calls, [])

    def test_completed_signed_bytes_recover_to_private_output_without_resigning(self):
        receipt = self.sign()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "Upload To WHT_signed.shortcut"
            recovered = recover_signed(
                self.endpoint,
                "token",
                receipt["idempotencyKey"],
                receipt["signedShortcutSha256"],
                output,
                transport=self.worker.get_recovery,
            )
            self.assertEqual(recovered["idempotencyKey"], receipt["idempotencyKey"])
            self.assertEqual(recovered["signedShortcutSha256"], receipt["signedShortcutSha256"])
            self.assertEqual(output.read_bytes(), b"synthetic-signed-shortcut")
            self.assertEqual(self.worker.signer_count, 1)

    def test_recovery_rejects_wrong_hash_or_ambiguous_operation_without_output(self):
        receipt = self.sign()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "signed.shortcut"
            with self.assertRaises(ReceiptError):
                recover_signed(
                    self.endpoint,
                    "token",
                    receipt["idempotencyKey"],
                    "d" * 64,
                    output,
                    transport=self.worker.get_recovery,
                )
            self.assertFalse(output.exists())
            self.worker.records[receipt["idempotencyKey"]]["ambiguous"] = True
            with self.assertRaises(ReceiptError):
                recover_signed(
                    self.endpoint,
                    "token",
                    receipt["idempotencyKey"],
                    receipt["signedShortcutSha256"],
                    output,
                    transport=self.worker.get_recovery,
                )
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
