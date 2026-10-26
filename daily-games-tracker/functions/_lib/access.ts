import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { ApiError } from "./http";
import { logAdminAccessDenied, type AdminDenialReason } from "./logging";
import type { AppEnv } from "./runtime";

const keySets = new Map<string, JWTVerifyGetKey>();

export function isAdminPath(path: string): boolean {
  return path.startsWith("/admin") || path === "/api/admin" || path.startsWith("/api/admin/");
}

export async function requireAdmin(request: Request, env: AppEnv, requestId = "unknown") {
  const {
    CLOUDFLARE_ACCESS_DOMAIN: issuer,
    CLOUDFLARE_ACCESS_AUD: audience,
    ADMIN_EMAIL: email,
  } = env;
  if (
    !issuer ||
    !audience ||
    !email ||
    !isAllowedAccessIssuer(issuer, env.APP_ENV)
  ) {
    throw new ApiError(503, "ADMIN_NOT_CONFIGURED", "Administrator access is not configured yet.");
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw deny(request, requestId, "missing_assertion", false);
  if (token.length > 16_384) throw deny(request, requestId, "assertion_too_large", true);

  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5_000,
    });
    keySets.set(issuer, keys);
  }
  try {
    return await verifyAdminToken(token, { issuer, audience, email }, keys);
  } catch (error) {
    if (error instanceof AdminAccessDenied) {
      logAdminAccessDenied({
        requestId,
        request,
        reason: error.adminDenialReason,
        assertionPresent: true,
      });
    }
    throw error;
  }
}

function isAllowedAccessIssuer(issuer: string, appEnv?: AppEnv["APP_ENV"]): boolean {
  return (
    /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) ||
    (appEnv === "test" && /^https:\/\/[a-z0-9-]+\.test\.invalid$/.test(issuer))
  );
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
      throw denied("identity_mismatch");
    }
    return { email: payload.email.toLowerCase(), subject: payload.sub };
  } catch (error) {
    if (error instanceof AdminAccessDenied) throw error;
    throw denied("invalid_assertion");
  }
}

function deny(
  request: Request,
  requestId: string,
  reason: AdminDenialReason,
  assertionPresent: boolean,
): AdminAccessDenied {
  logAdminAccessDenied({ requestId, request, reason, assertionPresent });
  return denied(reason);
}

function denied(reason: AdminDenialReason): AdminAccessDenied {
  return new AdminAccessDenied(
    403,
    "ADMIN_ACCESS_DENIED",
    "Sign in with the authorized administrator account.",
    reason,
  );
}

class AdminAccessDenied extends ApiError {
  constructor(
    statusCode: number,
    errorCode: string,
    publicMessage: string,
    readonly adminDenialReason: AdminDenialReason,
  ) {
    super(statusCode, errorCode, publicMessage);
  }
}
