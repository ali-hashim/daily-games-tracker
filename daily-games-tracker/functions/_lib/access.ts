import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { ApiError } from "./http";
import type { AppEnv } from "./runtime";

const keySets = new Map<string, JWTVerifyGetKey>();

export function isAdminPath(path: string): boolean {
  return path.startsWith("/admin") || path === "/api/admin" || path.startsWith("/api/admin/");
}

export async function requireAdmin(request: Request, env: AppEnv) {
  const {
    CLOUDFLARE_ACCESS_DOMAIN: issuer,
    CLOUDFLARE_ACCESS_AUD: audience,
    ADMIN_EMAIL: email,
  } = env;
  if (
    !issuer ||
    !audience ||
    !email ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)
  ) {
    throw new ApiError(503, "ADMIN_NOT_CONFIGURED", "Administrator access is not configured yet.");
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 16_384) throw denied();

  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5_000,
    });
    keySets.set(issuer, keys);
  }
  return verifyAdminToken(token, { issuer, audience, email }, keys);
}

/** The resolver argument permits signed-key tests; request data never controls the trusted key set. */
export async function verifyAdminToken(
  token: string,
  configuration: { issuer: string; audience: string; email: string },
  keys: JWTVerifyGetKey,
) {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: configuration.issuer,
      audience: configuration.audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"],
      clockTolerance: 5,
    });
    if (
      typeof payload.email !== "string" ||
      typeof payload.sub !== "string" ||
      !payload.sub ||
      payload.email.toLowerCase() !== configuration.email.toLowerCase()
    ) {
      throw denied();
    }
    return { email: payload.email.toLowerCase(), subject: payload.sub };
  } catch {
    throw denied();
  }
}

function denied() {
  return new ApiError(
    403,
    "ADMIN_ACCESS_DENIED",
    "Sign in with the authorized administrator account.",
  );
}
