/** Cloud Run Gemini WebSocket proxy (production). */
export const CLOUD_PROXY_URL =
  "wss://gemini-proxy-483139385570.us-central1.run.app";

/** Local dev proxy (scripts/dev-local.sh or proxy-server/server.py). */
export const LOCAL_PROXY_URL = "ws://127.0.0.1:8080";

function isLocalDevHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

/**
 * Pick WebSocket proxy URL.
 * - ?proxy=local|cloud overrides
 * - localhost / 127.0.0.1 defaults to local proxy (avoids Cloud Run origin checks)
 */
export function resolveProxyUrl() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("proxy");
  if (override === "local") return LOCAL_PROXY_URL;
  if (override === "cloud") return CLOUD_PROXY_URL;
  if (isLocalDevHost(window.location.hostname)) return LOCAL_PROXY_URL;
  return CLOUD_PROXY_URL;
}
