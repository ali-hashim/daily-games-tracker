import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { requireAdmin, verifyAdminToken } from "../../functions/_lib/access";
import type { AppEnv } from "../../functions/_lib/runtime";

const config = {
  issuer: "https://team.example.invalid",
  audience: "wht-admin",
  email: "admin@example.test",
};
let privateKey: CryptoKey;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "test", alg: "RS256" }],
  });
});

async function sign(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ email: config.email, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject("admin-subject")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
}

afterEach(() => vi.restoreAllMocks());

describe("Cloudflare Access security boundary", () => {
  it("accepts the signed administrator identity", async () => {
    await expect(verifyAdminToken(await sign(), config, keys)).resolves.toEqual({
      email: config.email,
      subject: "admin-subject",
    });
  });

  it("rejects another email even with the correct issuer and audience", async () => {
    await expect(
      verifyAdminToken(await sign({ email: "other@example.test" }), config, keys),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(["issuer", "audience"] as const)("rejects a mismatched %s", async (field) => {
    await expect(
      verifyAdminToken(await sign(), { ...config, [field]: "wrong" }, keys),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects expired tokens and tokens without an expiry", async () => {
    for (const expiry of [0, undefined]) {
      const jwt = new SignJWT({ email: config.email })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer(config.issuer)
        .setAudience(config.audience)
        .setSubject("admin-subject")
        .setIssuedAt();
      if (expiry !== undefined) jwt.setExpirationTime(expiry);
      await expect(
        verifyAdminToken(await jwt.sign(privateKey), config, keys),
      ).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it("rejects an attacker-signed token", async () => {
    const attacker = await generateKeyPair("RS256");
    const jwt = await new SignJWT({ email: config.email })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setSubject("attacker")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(attacker.privateKey);
    await expect(verifyAdminToken(jwt, config, keys)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("fails closed before network or database access when configuration is missing", async () => {
    await expect(
      requireAdmin(new Request("https://wht.test/api/admin/players"), {} as AppEnv),
    ).rejects.toMatchObject({ errorCode: "ADMIN_NOT_CONFIGURED" });
  });

  it("does not trust identity headers without a signed assertion", async () => {
    const request = new Request("https://wht.test/api/admin/players", {
      headers: { "Cf-Access-Authenticated-User-Email": config.email },
    });
    const error = await requireAdmin(
      request,
      {
        ...config,
        CLOUDFLARE_ACCESS_DOMAIN: config.issuer,
        CLOUDFLARE_ACCESS_AUD: config.audience,
        ADMIN_EMAIL: config.email,
      } as unknown as AppEnv,
      "req_missing",
    ).catch((value: unknown) => value);
    expect(error).toMatchObject({
      statusCode: 403,
      errorCode: "ADMIN_ACCESS_DENIED",
      publicMessage: "Sign in with the authorized administrator account.",
      adminDenialReason: "missing_assertion",
    });
  });

  it("logs a bounded missing-assertion category with request correlation and no credentials", async () => {
    const output: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((value) => output.push(String(value)));
    const request = new Request("https://wht.test/api/admin/players?token=query-secret", {
      headers: { Cookie: "session=cookie-secret" },
    });

    await expect(
      requireAdmin(
        request,
        {
          ...config,
          CLOUDFLARE_ACCESS_DOMAIN: config.issuer,
          CLOUDFLARE_ACCESS_AUD: config.audience,
          ADMIN_EMAIL: config.email,
        } as unknown as AppEnv,
        "req_missing",
      ),
    ).rejects.toMatchObject({ statusCode: 403, errorCode: "ADMIN_ACCESS_DENIED" });

    expect(JSON.parse(output[0])).toEqual({
      level: "warn",
      event: "admin_access_denied",
      request_id: "req_missing",
      method: "GET",
      path: "/api/admin/players",
      reason: "missing_assertion",
      assertion_present: false,
    });
    expect(output[0]).not.toContain("query-secret");
    expect(output[0]).not.toContain("cookie-secret");
  });

  it("classifies bounded assertion and identity denial reasons without changing the public error", async () => {
    const env = {
      ...config,
      CLOUDFLARE_ACCESS_DOMAIN: config.issuer,
      CLOUDFLARE_ACCESS_AUD: config.audience,
      ADMIN_EMAIL: config.email,
    } as unknown as AppEnv;
    await expect(
      requireAdmin(
        new Request("https://wht.test/api/admin/dashboard", {
          headers: { "Cf-Access-Jwt-Assertion": "x".repeat(16_385) },
        }),
        env,
        "req_oversized",
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      publicMessage: "Sign in with the authorized administrator account.",
      adminDenialReason: "assertion_too_large",
    });
    await expect(verifyAdminToken("not-a-jwt", config, keys)).rejects.toMatchObject({
      statusCode: 403,
      publicMessage: "Sign in with the authorized administrator account.",
      adminDenialReason: "invalid_assertion",
    });
    await expect(
      verifyAdminToken(await sign({ email: "other@example.test" }), config, keys),
    ).rejects.toMatchObject({
      statusCode: 403,
      publicMessage: "Sign in with the authorized administrator account.",
      adminDenialReason: "identity_mismatch",
    });
  });
});
