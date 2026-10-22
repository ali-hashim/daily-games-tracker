import { isNetworkOnlyPath } from "../../shared/cache-policy";

export { isNetworkOnlyPath };

export function applyResponsePolicy(
  response: Response,
  requestId: string,
  pathname: string,
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-ID", requestId);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  if (isNetworkOnlyPath(pathname)) {
    headers.delete("Access-Control-Allow-Origin");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
  }
  if (isNetworkOnlyPath(pathname)) headers.set("Cache-Control", "no-store");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
