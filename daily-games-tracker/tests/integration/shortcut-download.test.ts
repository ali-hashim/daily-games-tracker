import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { onRequest as middleware } from "../../functions/_middleware";
import { requestRateLimiter } from "../../functions/_lib/rate-limit";
import { hashToken, randomToken } from "../../functions/_lib/tokens";
import type { AppData, AppEnv } from "../../functions/_lib/runtime";
import { onRequest as downloadApi } from "../../functions/api/shortcut/download";

const DOWNLOAD_PATH = "/api/shortcut/download";
const MAX_SHORTCUT_BYTES = 8 * 1024 * 1024;
const COMMIT = "a".repeat(40);

class MemoryBucket {
  readonly objects = new Map<string, Uint8Array>();
  readonly reads: string[] = [];

  async get(key: string): Promise<R2ObjectBody | null> {
    this.reads.push(key);
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      key,
      size: bytes.byteLength,
      etag: "synthetic",
      httpEtag: '"synthetic"',
      uploaded: new Date(0),
      httpMetadata: undefined,
      customMetadata: undefined,
      checksums: {},
      body: new Response(copyBuffer(bytes)).body!,
      arrayBuffer: async () => copyBuffer(bytes),
      text: async () => new TextDecoder().decode(bytes),
      json: async <T>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
      blob: async () => new Blob([copyBuffer(bytes)]),
      writeHttpMetadata: () => undefined,
    } as unknown as R2ObjectBody;
  }
}

let runtime: Miniflare;
let env: AppEnv;
let bucket: MemoryBucket;
let content: Uint8Array;
let downloadKey: string;

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('test'); } };",
      compatibilityDate: "2026-10-20",
      d1Databases: ["DB"],
    }),
  );
  env = { DB: (await runtime.getD1Database("DB")) as unknown as D1Database };
  const migrationDirectory = new URL("../../migrations/", import.meta.url);
  for (const statement of (await import("node:fs"))
    .readFileSync(new URL("0001_initial.sql", migrationDirectory), "utf8")
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}, 30_000);

beforeEach(async () => {
  requestRateLimiter.reset();
  bucket = new MemoryBucket();
  Object.assign(env, { SHORTCUT_BUCKET: bucket as unknown as R2Bucket });
  content = new TextEncoder().encode("synthetic private Shortcut payload");
  downloadKey = await installManifest(content);
  for (const table of ["web_sessions", "players"])
    await env.DB.prepare(`DELETE FROM ${table}`).run();
});

afterAll(async () => {
  await runtime?.dispose();
});

async function installManifest(bytes: Uint8Array): Promise<string> {
  const digest = await sha256(bytes);
  const key = `shortcuts/${COMMIT}/${digest}.shortcut`;
  bucket.objects.set(
    "latest.json",
    new TextEncoder().encode(
      JSON.stringify({
        commit: COMMIT,
        sha256: digest,
        key,
      }),
    ),
  );
  bucket.objects.set(key, bytes);
  return key;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", copyBuffer(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function createSession(playerId = "alex"): Promise<string> {
  const token = randomToken();
  const now = new Date();
  await env.DB.prepare("INSERT INTO players(id, display_name) VALUES (?, ?)")
    .bind(playerId, "Alex")
    .run();
  await env.DB.prepare(
    `INSERT INTO web_sessions(id, player_id, session_hash, idle_expires_at, absolute_expires_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `session-${playerId}`,
      playerId,
      await hashToken(token),
      new Date(now.getTime() + 86_400_000).toISOString(),
      new Date(now.getTime() + 86_400_000).toISOString(),
      now.toISOString(),
    )
    .run();
  return token;
}

async function invoke(request: Request): Promise<Response> {
  const data: AppData = { requestId: "" };
  return middleware({
    request,
    env,
    data,
    next: async () => downloadApi({ request, env, data } as Parameters<typeof downloadApi>[0]),
  } as unknown as Parameters<typeof middleware>[0]);
}

function downloadRequest(token?: string, method = "GET"): Request {
  const headers = token ? { Cookie: `dgt_session=${token}` } : undefined;
  return new Request(`https://wht.test${DOWNLOAD_PATH}`, { method, headers });
}

async function expectGenericUnavailable(request: Request): Promise<void> {
  const response = await invoke(request);
  const body = (await response.json()) as Record<string, unknown>;
  expect(response.status).toBe(503);
  expect(body).toMatchObject({
    status: "error",
    error_code: "SHORTCUT_UNAVAILABLE",
    error_message: "The Shortcut download is unavailable. Try again later.",
  });
  expect(body.request_id).toBe(response.headers.get("X-Request-ID"));
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(JSON.stringify(body)).not.toMatch(/shortcuts\/|sha256|bucket|R2|latest\.json/i);
}

describe("private authenticated Shortcut download", () => {
  it("serves only the manifest-verified object with fixed private download headers", async () => {
    const token = await createSession();
    const response = await invoke(downloadRequest(token));

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(content);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.apple.shortcut");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="Upload to WHT.shortcut"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-ID")).toMatch(/^req_[a-f0-9]{16}$/);
    expect(bucket.reads).toEqual(["latest.json", downloadKey]);
  });

  it("requires a valid session before reading any private objects", async () => {
    const response = await invoke(downloadRequest());
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(401);
    expect(body).toMatchObject({ status: "error", error_code: "SESSION_REQUIRED" });
    expect(bucket.reads).toEqual([]);
  });

  it("uses the shared API rate limit before authentication or storage access", async () => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await invoke(
        new Request(`https://wht.test${DOWNLOAD_PATH}`, {
          headers: { "CF-Connecting-IP": "198.51.100.75" },
        }),
      );
      expect(response.status).toBe(401);
    }
    const limited = await invoke(
      new Request(`https://wht.test${DOWNLOAD_PATH}`, {
        headers: { "CF-Connecting-IP": "198.51.100.75" },
      }),
    );
    const body = (await limited.json()) as Record<string, unknown>;
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(body).toMatchObject({ status: "error", error_code: "RATE_LIMITED" });
    expect(body.request_id).toBe(limited.headers.get("X-Request-ID"));
    expect(bucket.reads).toEqual([]);
  });

  it("rejects a revoked session before reading private objects", async () => {
    const token = await createSession();
    await env.DB.prepare("UPDATE web_sessions SET revoked_at = ?")
      .bind(new Date().toISOString())
      .run();
    expect((await invoke(downloadRequest(token))).status).toBe(401);
    expect(bucket.reads).toEqual([]);
  });

  it("rejects a deactivated player before reading private objects", async () => {
    const token = await createSession();
    await env.DB.prepare("UPDATE players SET active = 0").run();
    expect((await invoke(downloadRequest(token))).status).toBe(401);
    expect(bucket.reads).toEqual([]);
  });

  it("uses a generic error envelope when private storage is unconfigured", async () => {
    const token = await createSession();
    Object.assign(env, { SHORTCUT_BUCKET: undefined });
    await expectGenericUnavailable(downloadRequest(token));
    expect(bucket.reads).toEqual([]);
  });

  it("uses the same generic error for missing and malformed manifests", async () => {
    const token = await createSession();
    bucket.objects.delete("latest.json");
    await expectGenericUnavailable(downloadRequest(token));
    bucket.objects.set("latest.json", new TextEncoder().encode("not-json"));
    await expectGenericUnavailable(downloadRequest(token));
  });

  it("rejects extra manifest properties and keys outside the exact shortcut object path", async () => {
    const token = await createSession();
    const digest = await sha256(content);
    for (const manifest of [
      { commit: COMMIT, sha256: digest, key: downloadKey, extra: "hidden" },
      { commit: COMMIT, sha256: digest, key: "shortcuts/../latest.json" },
      { commit: COMMIT.toUpperCase(), sha256: digest, key: downloadKey },
      { commit: COMMIT, sha256: digest.toUpperCase(), key: downloadKey },
    ]) {
      bucket.objects.set("latest.json", new TextEncoder().encode(JSON.stringify(manifest)));
      await expectGenericUnavailable(downloadRequest(token));
    }
  });

  it("rejects missing objects and digest mismatches without exposing the manifest", async () => {
    const token = await createSession();
    bucket.objects.delete(downloadKey);
    await expectGenericUnavailable(downloadRequest(token));
    bucket.objects.set(downloadKey, new TextEncoder().encode("different shortcut bytes"));
    await expectGenericUnavailable(downloadRequest(token));
  });

  it("rejects payloads over the fixed size bound", async () => {
    const token = await createSession();
    const oversized = new Uint8Array(MAX_SHORTCUT_BYTES + 1);
    downloadKey = await installManifest(oversized);
    await expectGenericUnavailable(downloadRequest(token));
  });

  it("returns a JSON 405 envelope and does not read storage for unsupported methods", async () => {
    const token = await createSession();
    const response = await invoke(downloadRequest(token, "POST"));
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(body).toMatchObject({ status: "error", error_code: "METHOD_NOT_ALLOWED" });
    expect(body.request_id).toBe(response.headers.get("X-Request-ID"));
    expect(bucket.reads).toEqual([]);
  });
});
