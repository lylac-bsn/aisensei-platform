#!/usr/bin/env python3
"""
WebSocket Proxy Server for Gemini Live API
Handles authentication and proxies WebSocket connections.

This server acts as a bridge between the browser client and Gemini API,
handling Google Cloud authentication automatically using default credentials.
"""

import asyncio
import re
import websockets
import json
import ssl
import certifi
import os
from urllib.parse import urlparse
from websockets.exceptions import ConnectionClosed

# Google auth imports
import google.auth
from google.auth.transport.requests import Request

DEBUG = False  # Set to True for verbose logging
WS_PORT = int(os.environ.get("PORT", 8080))    # Port for WebSocket server (Cloud Run uses PORT env var)

# Allowed origins for WebSocket connections (security: reject unknown origins).
# Browsers send the page origin (e.g. custom domain or *.web.app), not the parent frame URL.
# Cloud Run: optional ALLOWED_ORIGINS is merged with this list (not a full replacement).
ALLOWED_ORIGINS = [
    # Main Gamecollege / AI Sensei site
    "https://ai-sensei-8849b.web.app",
    "https://ai-sensei-8849b.firebaseapp.com",
    "https://learnie.cc",
    "https://www.learnie.cc",
    # Embedded voice/screen apps (same proxy URL in voice-tab variants)
    "https://learnysensei-s1-2-voice.web.app",
    "https://learnysensei-s1-3.web.app",
    "https://learnysensei-s2-2.web.app",
    "https://learnysensei-s2-3.web.app",
    "https://learnysensei-s3-2.web.app",
    # Local dev
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
]

# Allowed service URL pattern (SSRF protection)
# Only allow connections to Google AI Platform Gemini API endpoints
# Example: wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent
ALLOWED_SERVICE_URL_PATTERN = re.compile(
    r"^wss://[a-z0-9-]+\.googleapis\.com/ws/google\.cloud\.aiplatform\.[a-zA-Z0-9._/]+"
)

# Connection limits (tuned for ~100 concurrent students)
MAX_MESSAGE_SIZE = 1 * 1024 * 1024  # 1 MB per message (audio chunks are small)
PING_TIMEOUT = 30           # Close connection if no pong in 30s
CLOSE_TIMEOUT = 10          # Wait 10s for clean close


def validate_service_url(service_url: str) -> bool:
    """
    Validate that the service URL points to a legitimate Google AI Platform endpoint.
    Prevents SSRF attacks by rejecting arbitrary URLs.
    """
    if not service_url or not isinstance(service_url, str):
        return False
    return bool(ALLOWED_SERVICE_URL_PATTERN.match(service_url))


def generate_access_token():
    """Retrieves an access token using Google Cloud default credentials."""
    try:
        creds, _ = google.auth.default()
        if not creds.valid:
            creds.refresh(Request())
        return creds.token
    except Exception as e:
        print(f"Error generating access token: {e}")
        print("Make sure you're logged in with: gcloud auth application-default login")
        return None


def _allowed_origin_set():
    """Code defaults plus optional ALLOWED_ORIGINS env entries (merged)."""
    out = {x.strip() for x in ALLOWED_ORIGINS if x.strip()}
    extra = os.environ.get("ALLOWED_ORIGINS", "").strip()
    if extra:
        out.update(x.strip() for x in extra.split(",") if x.strip())
    return out


def check_origin(origin: str) -> bool:
    """Check if the WebSocket connection origin is allowed."""
    if not origin:
        return False
    o = origin.strip()

    # Custom prod domain and any subdomain (https only): learnie.cc, www.learnie.cc, app.learnie.cc, …
    if o.startswith("https://"):
        try:
            host = urlparse(o).hostname
            if host:
                if host == "learnie.cc" or host.endswith(".learnie.cc"):
                    return True
        except Exception:
            pass

    return o in _allowed_origin_set()


def get_origin(websocket) -> str:
    """Get the Origin header from a websocket connection (compatible with websockets 13+)."""
    try:
        # websockets 13+ (new API)
        return websocket.request.headers.get("Origin", "")
    except AttributeError:
        pass
    try:
        # websockets legacy API
        return websocket.request_headers.get("Origin", "")
    except AttributeError:
        pass
    return ""


async def proxy_task(source_websocket, destination_websocket, is_server: bool) -> None:
    """
    Forwards messages from source_websocket to destination_websocket.
    """
    try:
        async for message in source_websocket:
            try:
                data = json.loads(message)
                if DEBUG:
                    print(f"Proxying from {'server' if is_server else 'client'}: {data}")
                await destination_websocket.send(json.dumps(data))
            except Exception as e:
                print(f"Error processing message: {e}")
    except ConnectionClosed as e:
        print(
            f"{'Server' if is_server else 'Client'} connection closed: {e.code} - {e.reason}"
        )
    except Exception as e:
        print(f"Unexpected error in proxy_task: {e}")
    finally:
        try:
            await destination_websocket.close()
        except:
            pass


async def create_proxy(client_websocket, bearer_token: str, service_url: str) -> None:
    """
    Establishes a WebSocket connection to the Gemini server and creates bidirectional proxy.
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }

    ssl_context = ssl.create_default_context(cafile=certifi.where())

    print(f"Connecting to Gemini API...")
    if DEBUG:
        print(f"Service URL: {service_url}")

    try:
        async with websockets.connect(
            service_url,
            additional_headers=headers,
            ssl=ssl_context
        ) as server_websocket:
            print(f"✅ Connected to Gemini API")

            client_to_server_task = asyncio.create_task(
                proxy_task(client_websocket, server_websocket, is_server=False)
            )
            server_to_client_task = asyncio.create_task(
                proxy_task(server_websocket, client_websocket, is_server=True)
            )

            done, pending = await asyncio.wait(
                [client_to_server_task, server_to_client_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            try:
                await server_websocket.close()
            except:
                pass

            try:
                await client_websocket.close()
            except:
                pass

    except ConnectionClosed as e:
        print(f"Server connection closed unexpectedly: {e.code} - {e.reason}")
        try:
            await client_websocket.close(code=e.code, reason=e.reason)
        except:
            pass
    except Exception as e:
        print(f"Failed to connect to Gemini API: {e}")
        try:
            await client_websocket.close(code=1008, reason="Upstream connection failed")
        except:
            pass


async def handle_websocket_client(client_websocket) -> None:
    """
    Handles a new WebSocket client connection.
    Expects first message with optional bearer_token and service_url.
    """
    # Origin check (compatible with websockets 13+)
    origin = get_origin(client_websocket)
    if not check_origin(origin):
        print(f"❌ Rejected connection from disallowed origin: {origin}")
        await client_websocket.close(code=1008, reason="Origin not allowed")
        return

    print(f"🔌 New WebSocket client connection from origin: {origin}")
    try:
        # Wait for the first message from the client
        service_setup_message = await asyncio.wait_for(
            client_websocket.recv(), timeout=10.0
        )
        service_setup_message_data = json.loads(service_setup_message)

        bearer_token = service_setup_message_data.get("bearer_token")
        service_url = service_setup_message_data.get("service_url")

        # If no bearer token provided, generate one using default credentials
        if not bearer_token:
            print("🔑 Generating access token using default credentials...")
            bearer_token = generate_access_token()
            if not bearer_token:
                print("❌ Failed to generate access token")
                await client_websocket.close(
                    code=1008, reason="Authentication failed"
                )
                return
            print("✅ Access token generated")

        if not service_url:
            print("❌ Error: Service URL is missing")
            await client_websocket.close(
                code=1008, reason="Service URL is required"
            )
            return

        # SSRF protection: validate service_url points to Gemini API only
        if not validate_service_url(service_url):
            print(f"❌ Rejected invalid service URL: {service_url}")
            await client_websocket.close(
                code=1008, reason="Invalid service URL"
            )
            return

        await create_proxy(client_websocket, bearer_token, service_url)

    except asyncio.TimeoutError:
        print("⏱️ Timeout waiting for the first message from the client")
        await client_websocket.close(code=1008, reason="Timeout")
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in first message: {e}")
        await client_websocket.close(code=1008, reason="Invalid JSON")
    except Exception as e:
        print(f"❌ Error handling client: {e}")
        try:
            await client_websocket.close(code=1011, reason="Internal error")
        except:
            pass


async def start_websocket_server():
    """Start the WebSocket proxy server."""
    host = os.environ.get("HOST", "0.0.0.0")
    async with websockets.serve(
        handle_websocket_client,
        host,
        WS_PORT,
        max_size=MAX_MESSAGE_SIZE,
        ping_timeout=PING_TIMEOUT,
        close_timeout=CLOSE_TIMEOUT,
    ):
        print(f"🔌 WebSocket proxy running on ws://{host}:{WS_PORT}")
        print(f"   Max message: {MAX_MESSAGE_SIZE // 1024}KB | Ping timeout: {PING_TIMEOUT}s")
        await asyncio.Future()


async def main():
    """Starts the WebSocket server."""
    print(f"""
╔════════════════════════════════════════════════════════════╗
║     Gemini Live API Proxy Server                          ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  🔌 WebSocket Proxy: ws://localhost:{WS_PORT:<5}                   ║
║  📦 Max Message: {MAX_MESSAGE_SIZE // 1024}KB                              ║
║                                                            ║
║  Authentication:                                           ║
║  • Uses Google Cloud default credentials                  ║
║  • Run: gcloud auth application-default login             ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
""")

    await start_websocket_server()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Servers stopped")
