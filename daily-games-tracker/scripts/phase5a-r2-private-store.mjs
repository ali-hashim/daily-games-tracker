import { createHash, createHmac } from "node:crypto";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 250;
const MAX_PRIVATE_OBJECT_BYTES = 16 * 1024 * 1024;

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function assertCredentials(options) {
  const accountId = options.accountId ?? process.env.WHT_R2_ACCOUNT_ID;
  const bucketName = options.bucketName ?? process.env.WHT_R2_BUCKET_NAME;
  const accessKeyId = options.accessKeyId ?? process.env.WHT_R2_ACCESS_KEY_ID;
  const secretAccessKey = options.secretAccessKey ?? process.env.WHT_R2_SECRET_ACCESS_KEY;
  if (
    typeof accountId !== "string" ||
    !/^[0-9a-f]{32}$/i.test(accountId) ||
    typeof bucketName !== "string" ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName) ||
    typeof accessKeyId !== "string" ||
    !accessKeyId ||
    /[\r\n]/.test(accessKeyId) ||
    typeof secretAccessKey !== "string" ||
    !secretAccessKey ||
    /[\r\n]/.test(secretAccessKey)
  ) {
    throw new Error("R2 private storage configuration is incomplete");
  }
  return { accountId, bucketName, accessKeyId, secretAccessKey };
}

function objectPath(bucketName, key) {
  if (
    typeof key !== "string" ||
    !key ||
    key.startsWith("/") ||
    key.endsWith("/") ||
    key
      .split("/")
      .some(
        (segment) =>
          !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9._-]+$/.test(segment),
      )
  ) {
    throw new Error("R2 object key is invalid");
  }
  return `/${encodeURIComponent(bucketName)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function signedRequest({ credentials, method, key, body, contentType, now }) {
  const host = `${credentials.accountId}.r2.cloudflarestorage.com`;
  const url = new URL(`https://${host}${objectPath(credentials.bucketName, key)}`);
  const bytes = body ?? Buffer.alloc(0);
  const payloadHash = digest(bytes);
  const date = now()
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = date.slice(0, 8);
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": date,
  };
  if (contentType) headers["content-type"] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join("");
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    date,
    scope,
    digest(Buffer.from(canonicalRequest, "utf8")),
  ].join("\n");
  const dateKey = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url, headers, body: method === "PUT" ? bytes : undefined };
}

async function cancelResponse(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Response cleanup must not replace the generic storage error.
  }
}

async function readBoundedBody(response) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_PRIVATE_OBJECT_BYTES) {
      await cancelResponse(response);
      throw new Error("R2 private storage object is too large");
    }
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PRIVATE_OBJECT_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error("R2 private storage object is too large");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error?.message === "R2 private storage object is too large") throw error;
    throw new Error("R2 private storage response failed");
  }
  return Buffer.concat(chunks, size);
}

export function createR2PrivateStore(options = {}) {
  const credentials = assertCredentials(options);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("R2 private storage request is unavailable");
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0)
    throw new Error("R2 retry configuration is invalid");

  async function request(method, key, body, contentType, allowMissing = false) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const signed = signedRequest({ credentials, method, key, body, contentType, now });
      let response;
      try {
        response = await fetchImpl(signed.url, {
          method,
          headers: signed.headers,
          ...(signed.body === undefined ? {} : { body: signed.body }),
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(retryDelayMs * 2 ** (attempt - 1));
        continue;
      }
      if (allowMissing && response.status === 404) {
        await cancelResponse(response);
        return { response, body: null };
      }
      if (response.ok) {
        if (method === "GET") {
          try {
            const responseBody = await readBoundedBody(response);
            return { response, body: responseBody };
          } catch (error) {
            if (error?.message === "R2 private storage object is too large") throw error;
            if (attempt === MAX_ATTEMPTS) break;
            await sleep(retryDelayMs * 2 ** (attempt - 1));
            continue;
          }
        }
        await cancelResponse(response);
        return { response, body: null };
      }
      if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) {
        await cancelResponse(response);
        throw new Error("R2 private storage request failed");
      }
      await cancelResponse(response);
      await sleep(retryDelayMs * 2 ** (attempt - 1));
    }
    throw new Error("R2 private storage request failed");
  }

  return Object.freeze({
    async get(key) {
      const { body } = await request("GET", key);
      return body;
    },

    async getOptional(key) {
      const { response, body } = await request("GET", key, undefined, undefined, true);
      if (response.status === 404) return null;
      return body;
    },

    async putVerified(key, value, contentType = "application/octet-stream") {
      const bytes = Buffer.from(value);
      if (bytes.length > MAX_PRIVATE_OBJECT_BYTES)
        throw new Error("R2 private storage object is too large");
      await request("PUT", key, bytes, contentType);
      const confirmed = await this.get(key);
      const expectedDigest = digest(bytes);
      if (digest(confirmed) !== expectedDigest)
        throw new Error("R2 object digest verification failed");
      return expectedDigest;
    },
  });
}
