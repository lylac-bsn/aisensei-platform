/** Cloud Run Gemini WebSocket proxy (production). */
export const CLOUD_PROXY_URL =
  "wss://gemini-proxy-483139385570.us-central1.run.app";

/** Local dev proxy (scripts/dev-local.sh or proxy-server/server.py). */
export const LOCAL_PROXY_URL = "ws://127.0.0.1:8080";

/**
 * Pick WebSocket proxy URL.
 * - Default: Cloud Run proxy (works on learnie.cc and local http://127.0.0.1:5000)
 * - ?proxy=local — local proxy-server on :8080 (needs gcloud auth + server.py)
 * - ?proxy=cloud — force Cloud Run
 */
export function resolveProxyUrl() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("proxy");
  if (override === "local") return LOCAL_PROXY_URL;
  return CLOUD_PROXY_URL;
}
