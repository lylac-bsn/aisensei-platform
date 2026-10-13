"""Native-path auth tests. Run: python -m unittest test_native_auth (from proxy-server/)."""

import asyncio
import json
import unittest
from unittest import mock

import websockets
from websockets.exceptions import ConnectionClosed, InvalidStatus

import server

VALID_ID = "valid-id-token"
VALID_AC = "valid-app-check"
SERVICE_URL = (
    "wss://asia-northeast1-aiplatform.googleapis.com/ws/"
    "google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"
)


def fake_verify_id(token):
    if token != VALID_ID:
        raise ValueError("bad id token")
    return {"uid": "student-1"}


def fake_verify_app_check(token):
    if token != VALID_AC:
        raise ValueError("bad app check")
    return {"app_id": "1:483139385570:ios:abc"}


class NativeAuthTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.proxied = []

        async def fake_create_proxy(client_ws, bearer_token, service_url):
            self.proxied.append({"bearer_token": bearer_token, "service_url": service_url,
                                 "uid": getattr(client_ws, "native_uid", None)})
            await client_ws.send(json.dumps({"ok": True}))
            await client_ws.close()

        self.patches = [
            mock.patch.object(server, "verify_firebase_id_token", fake_verify_id),
            mock.patch.object(server, "verify_app_check_token", fake_verify_app_check),
            mock.patch.object(server, "create_proxy", fake_create_proxy),
            mock.patch.object(server, "generate_access_token", lambda: "server-token"),
            mock.patch.dict("os.environ", {"NATIVE_APP_CHECK_APP_IDS": ""}),
        ]
        for p in self.patches:
            p.start()
        self.srv = await websockets.serve(
            server.handle_websocket_client, "127.0.0.1", 0, process_request=server.process_request
        )
        port = self.srv.sockets[0].getsockname()[1]
        self.base = f"ws://127.0.0.1:{port}"

    async def asyncTearDown(self):
        self.srv.close()
        await self.srv.wait_closed()
        for p in self.patches:
            p.stop()

    async def expect_401(self, headers):
        with self.assertRaises(InvalidStatus) as ctx:
            async with websockets.connect(self.base + "/native", additional_headers=headers):
                pass
        self.assertEqual(ctx.exception.response.status_code, 401)

    async def test_missing_credentials_rejected_before_upgrade(self):
        await self.expect_401({})
        await self.expect_401({"Authorization": f"Bearer {VALID_ID}"})
        await self.expect_401({"X-Firebase-AppCheck": VALID_AC})

    async def test_allowed_origin_does_not_bypass_native_auth(self):
        await self.expect_401({"Origin": "https://learnie.cc"})

    async def test_invalid_tokens_rejected(self):
        await self.expect_401({"Authorization": "Bearer nope", "X-Firebase-AppCheck": VALID_AC})
        await self.expect_401({"Authorization": f"Bearer {VALID_ID}", "X-Firebase-AppCheck": "nope"})

    async def test_app_id_allowlist(self):
        with mock.patch.dict("os.environ", {"NATIVE_APP_CHECK_APP_IDS": "1:other:ios:x"}):
            await self.expect_401({"Authorization": f"Bearer {VALID_ID}", "X-Firebase-AppCheck": VALID_AC})

    async def test_valid_native_connection_ignores_client_bearer_token(self):
        headers = {"Authorization": f"Bearer {VALID_ID}", "X-Firebase-AppCheck": VALID_AC}
        async with websockets.connect(self.base + "/native", additional_headers=headers) as ws:
            await ws.send(json.dumps({"service_url": SERVICE_URL, "bearer_token": "client-supplied"}))
            self.assertEqual(json.loads(await ws.recv()), {"ok": True})
        self.assertEqual(len(self.proxied), 1)
        self.assertEqual(self.proxied[0]["bearer_token"], "server-token")
        self.assertEqual(self.proxied[0]["uid"], "student-1")

    async def test_id_token_header_accepted(self):
        headers = {"X-Firebase-ID-Token": VALID_ID, "X-Firebase-AppCheck": VALID_AC}
        async with websockets.connect(self.base + "/native", additional_headers=headers) as ws:
            await ws.send(json.dumps({"service_url": SERVICE_URL}))
            self.assertEqual(json.loads(await ws.recv()), {"ok": True})
        await self.expect_401({"X-Firebase-ID-Token": "nope", "X-Firebase-AppCheck": VALID_AC})

    async def test_native_rejects_non_gemini_service_url(self):
        headers = {"Authorization": f"Bearer {VALID_ID}", "X-Firebase-AppCheck": VALID_AC}
        async with websockets.connect(self.base + "/native", additional_headers=headers) as ws:
            await ws.send(json.dumps({"service_url": "wss://evil.example.com/x"}))
            with self.assertRaises(ConnectionClosed) as ctx:
                await ws.recv()
        self.assertEqual(ctx.exception.rcvd.code, 1008)
        self.assertEqual(self.proxied, [])

    async def test_web_path_still_requires_allowed_origin(self):
        async with websockets.connect(self.base + "/") as ws:
            with self.assertRaises(ConnectionClosed) as ctx:
                await ws.recv()
        self.assertEqual(ctx.exception.rcvd.reason, "Origin not allowed")

    async def test_web_path_with_allowed_origin_unchanged(self):
        async with websockets.connect(self.base + "/", origin="https://learnie.cc") as ws:
            await ws.send(json.dumps({"service_url": SERVICE_URL, "bearer_token": "web-token"}))
            self.assertEqual(json.loads(await ws.recv()), {"ok": True})
        self.assertEqual(self.proxied[0]["bearer_token"], "web-token")
        self.assertIsNone(self.proxied[0]["uid"])


if __name__ == "__main__":
    unittest.main()
