"""Offline support coverage for the reduced full-client signing transport."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from io import BytesIO

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import phase5a_send_hubsign as sender


class SenderSupportTests(unittest.TestCase):
    def test_exact_json_wire_and_invalid_utf8(self):
        self.assertEqual(
            sender.json_request_body(b'<x>&\n</x>', 'WHT'),
            b'{"shortcut":"\\u003cx\\u003e\\u0026\\n\\u003c/x\\u003e","shortcutName":"WHT"}',
        )
        with self.assertRaises(sender.SendError):
            sender.json_request_body(b'\xff', 'WHT')

    def test_one_post_exact_headers_and_body(self):
        calls = []
        class Reply:
            status = 200
            headers = {'Content-Type': 'application/octet-stream'}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'AEA1synthetic'
        def opened(request, timeout):
            calls.append((request, timeout))
            return Reply()
        with patch.object(sender._NO_REDIRECT_OPENER, 'open', side_effect=opened):
            reply = sender.post_once(sender.HUBSIGN_ENDPOINT, b'<x/>', 'WHT', 'unused', 4)
        self.assertEqual(len(calls), 1)
        request, timeout = calls[0]
        self.assertEqual((request.full_url, request.method, timeout), (sender.HUBSIGN_ENDPOINT, 'POST', 4))
        self.assertEqual(request.data, sender.json_request_body(b'<x/>', 'WHT'))
        self.assertEqual(request.get_header('Content-type'), 'application/json')
        self.assertEqual(request.get_header('Content-length'), str(len(request.data)))
        self.assertEqual(request.get_header('User-agent'), 'cherri/v2.3.0')
        self.assertEqual(reply.body, b'AEA1synthetic')

    def test_failures_are_not_retried_and_redirects_are_refused(self):
        failures = [
            HTTPError(sender.HUBSIGN_ENDPOINT, 403, 'refused', {'Content-Type': 'text/plain'}, BytesIO(b'refused')),
            URLError('offline synthetic failure'),
        ]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                with patch.object(sender._NO_REDIRECT_OPENER, 'open', side_effect=failure) as opened:
                    reply = sender.post_once(sender.HUBSIGN_ENDPOINT, b'<x/>', 'WHT', 'unused')
                self.assertEqual(opened.call_count, 1)
                self.assertTrue(reply.error)
                self.assertEqual(reply.status, 403 if isinstance(failure, HTTPError) else None)
        self.assertIsNone(sender._NoRedirectHandler().redirect_request(None, None, 302, '', {}, 'https://example.invalid'))


if __name__ == '__main__':
    unittest.main()
