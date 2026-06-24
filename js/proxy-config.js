/** Tokyo Cloud Run proxy — default (lower latency for Japan). */
export const TOKYO_CLOUD_PROXY_URL =
  "wss://gemini-proxy-n3yyxcllkq-an.a.run.app";

/** US Cloud Run proxy — fallback. */
export const US_CLOUD_PROXY_URL =
  "wss://gemini-proxy-483139385570.us-central1.run.app";

/** Default production proxy. */
export const CLOUD_PROXY_URL = TOKYO_CLOUD_PROXY_URL;

/** Local dev proxy (scripts/dev-local.sh or proxy-server/server.py). */
export const LOCAL_PROXY_URL = "ws://127.0.0.1:8080";

/**
 * Pick WebSocket proxy URL.
 * - Default: Tokyo Cloud Run
 * - ?proxy=us — US Cloud Run fallback
 * - ?proxy=local — local proxy-server on :8080
 */
export function resolveProxyUrl() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("proxy");
  if (override === "local") return LOCAL_PROXY_URL;
  if (override === "us") return US_CLOUD_PROXY_URL;
  if (override === "tokyo") return TOKYO_CLOUD_PROXY_URL;
  return TOKYO_CLOUD_PROXY_URL;
}
