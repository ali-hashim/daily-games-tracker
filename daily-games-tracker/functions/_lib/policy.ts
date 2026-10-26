import { isNetworkOnlyPath } from "../../shared/cache-policy";

export { isNetworkOnlyPath };

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()";

export function applyResponsePolicy(
  response: Response,
  requestId: string,
  pathname: string,
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-ID", requestId);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  for (const header of [
    "Access-Control-Allow-Credentials",
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Methods",
    "Access-Control-Allow-Origin",
    "Access-Control-Expose-Headers",
    "Access-Control-Max-Age",
  ]) {
    headers.delete(header);
  }
  if (isNetworkOnlyPath(pathname)) {
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  if (isNetworkOnlyPath(pathname) || isSpaNavigationPath(pathname)) {
    headers.set("Cache-Control", "no-store");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isSpaNavigationPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/index.html") return true;
  if (pathname.startsWith("/assets/") || pathname === "/sw.js") return false;
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return lastSegment.length > 0 && !lastSegment.includes(".");
}
