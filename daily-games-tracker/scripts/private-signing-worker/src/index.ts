const DEFAULT_HUBSIGN_ENDPOINT = "https://hubsign.routinehub.services/sign";
const RECORD_KEY = "operation";
const SIGNED_BYTES_KEY = "signedShortcutBytes";
const MAX_REQUEST_BYTES = 1_000_000;
const MAX_SIGNED_BYTES = 1_000_000;
const HUBSIGN_TIMEOUT_MS = 30_000;
const OPERATION_PREFIX = "wht-shortcut-signing-v2\n";

type OperationStatus = "pending" | "completed" | "ambiguous";

interface OperationRecord {
  schemaVersion: 2;
  status: OperationStatus;
  idempotencyKey: string;
  sourceCommit: string;
  targetOriginSha256: string;
  manifestSha256: string;
  wireSha256: string;
  durableReceiptId: string;
  signedShortcutSha256?: string;
}

interface SignRequest {
  schemaVersion: 2;
  operation: "wht-shortcut-signing";
  status: "sign";
  idempotencyKey: string;
  sourceCommit: string;
  targetOriginSha256: string;
  manifestSha256: string;
  wireSha256: string;
  shortcutName: "Upload To WHT";
  hubsignWireBase64: string;
  wireBytes: Uint8Array;
}

interface Env {
  SIGNING_OPERATIONS: DurableObjectNamespace;
  WHT_SIGNING_RECEIPT_TOKEN?: string;
  HUBSIGN_ENDPOINT?: string;
  HUBSIGN_TIMEOUT_MS?: string;
  // Test-only local HTTP escape hatch. It is absent from the deploy template.
  ALLOW_INSECURE_HUBSIGN_HTTP?: string;
}

class ServiceError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fail(status: number, code: string): never {
  throw new ServiceError(status, code);
}

function isLowerHex(value: unknown, length: number): value is string {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", digestInput.buffer));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function equalSecret(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256Hex(left), sha256Hex(right)]);
  let difference = leftHash.length ^ rightHash.length;
  for (let index = 0; index < Math.max(leftHash.length, rightHash.length); index += 1) {
    difference |= (leftHash.charCodeAt(index) || 0) ^ (rightHash.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function canonicalJsonString(value: string): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function decodeWire(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_REQUEST_BYTES) {
    fail(400, "invalid_wire");
  }
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    fail(400, "invalid_wire");
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    fail(400, "invalid_wire");
  }
  if (btoa(binary) !== value) fail(400, "invalid_wire");
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function parseWire(wireBytes: Uint8Array): void {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(wireBytes);
  } catch {
    fail(400, "invalid_wire");
  }
  let wire: unknown;
  try {
    wire = JSON.parse(text);
  } catch {
    fail(400, "invalid_wire");
  }
  if (!wire || typeof wire !== "object" || Array.isArray(wire)) fail(400, "invalid_wire");
  const entries = Object.entries(wire);
  if (entries.length !== 2 || !Object.hasOwn(wire, "shortcut") || !Object.hasOwn(wire, "shortcutName")) {
    fail(400, "invalid_wire");
  }
  const record = wire as Record<string, unknown>;
  if (typeof record.shortcut !== "string" || record.shortcutName !== "Upload To WHT") {
    fail(400, "invalid_wire");
  }
  const canonical = `{"shortcut":${canonicalJsonString(record.shortcut)},"shortcutName":"Upload To WHT"}`;
  if (canonical !== text) fail(400, "invalid_wire");
}

async function validatePayload(value: unknown): Promise<SignRequest> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(400, "invalid_request");
  const record = value as Record<string, unknown>;
  const expectedKeys = new Set([
    "schemaVersion", "operation", "status", "idempotencyKey", "sourceCommit",
    "targetOriginSha256", "manifestSha256", "wireSha256", "shortcutName", "hubsignWireBase64",
  ]);
  if (Object.keys(record).length !== expectedKeys.size || Object.keys(record).some(key => !expectedKeys.has(key))) {
    fail(400, "invalid_request");
  }
  if (record.schemaVersion !== 2 || record.operation !== "wht-shortcut-signing" || record.status !== "sign") {
    fail(400, "invalid_request");
  }
  if (!isLowerHex(record.sourceCommit, 40)
    || !isLowerHex(record.targetOriginSha256, 64)
    || !isLowerHex(record.manifestSha256, 64)
    || !isLowerHex(record.wireSha256, 64)
    || !isLowerHex(record.idempotencyKey, 64)
    || record.shortcutName !== "Upload To WHT") {
    fail(400, "invalid_request");
  }
  const expectedKey = await sha256Hex(`${OPERATION_PREFIX}${record.sourceCommit}\n${record.targetOriginSha256}`);
  if (record.idempotencyKey !== expectedKey) fail(400, "invalid_idempotency_key");
  const wireBytes = decodeWire(record.hubsignWireBase64);
  parseWire(wireBytes);
  if (await sha256Hex(wireBytes) !== record.wireSha256) fail(400, "invalid_wire_digest");
  return { ...record, wireBytes } as SignRequest;
}

function endpointFor(env: Env): string {
  const endpoint = env.HUBSIGN_ENDPOINT || DEFAULT_HUBSIGN_ENDPOINT;
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    fail(500, "signer_not_configured");
  }
  const testHttp = env.ALLOW_INSECURE_HUBSIGN_HTTP === "true";
  const localTestHost = parsed.hostname === "127.0.0.1"
    || parsed.hostname === "localhost"
    || parsed.hostname === "local-test.invalid";
  if (endpoint !== DEFAULT_HUBSIGN_ENDPOINT && (!testHttp || !localTestHost)) {
    fail(500, "signer_not_configured");
  }
  if ((!testHttp && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail(500, "signer_not_configured");
  }
  return endpoint;
}

function timeoutFor(env: Env): number {
  const parsed = Number(env.HUBSIGN_TIMEOUT_MS || HUBSIGN_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 120_000 ? parsed : HUBSIGN_TIMEOUT_MS;
}

async function sendHubSignOnce(env: Env, wireBytes: Uint8Array): Promise<Uint8Array> {
  let response: Response;
  const endpoint = endpointFor(env);
  const requestBody = new Uint8Array(wireBytes.byteLength);
  requestBody.set(wireBytes);
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "content-length": String(wireBytes.byteLength),
        "user-agent": "wht-private-signing-worker/1",
      },
      body: requestBody.buffer,
      signal: AbortSignal.timeout(timeoutFor(env)),
    });
  } catch {
    fail(502, "ambiguous_signer_result");
  }
  if (response.status !== 200 || response.headers.get("content-type")?.split(";", 1)[0].toLowerCase() !== "application/octet-stream") {
    fail(502, "ambiguous_signer_result");
  }
  const signed = new Uint8Array(await response.arrayBuffer());
  if (signed.byteLength < 4 || signed.byteLength > MAX_SIGNED_BYTES
    || signed[0] !== 0x41 || signed[1] !== 0x45 || signed[2] !== 0x41 || signed[3] !== 0x31) {
    fail(502, "ambiguous_signer_result");
  }
  return signed;
}

function immutableMatches(left: OperationRecord, right: SignRequest): boolean {
  return left.idempotencyKey === right.idempotencyKey
    && left.sourceCommit === right.sourceCommit
    && left.targetOriginSha256 === right.targetOriginSha256
    && left.manifestSha256 === right.manifestSha256
    && left.wireSha256 === right.wireSha256;
}

function receipt(record: OperationRecord): Record<string, string> {
  if (!record.signedShortcutSha256) fail(500, "stored_receipt_invalid");
  return {
    status: "completed",
    idempotencyKey: record.idempotencyKey,
    durableReceiptId: record.durableReceiptId,
    signedShortcutSha256: record.signedShortcutSha256,
  };
}

function signedShortcutResponse(record: OperationRecord, signed: ArrayBuffer): Response {
  if (!record.signedShortcutSha256) fail(500, "stored_receipt_invalid");
  return new Response(signed, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="Upload-To-WHT_signed.shortcut"',
      "content-type": "application/octet-stream",
      "content-length": String(signed.byteLength),
      "x-wht-durable-receipt-id": record.durableReceiptId,
      "x-wht-idempotency-key": record.idempotencyKey,
      "x-wht-signed-sha256": record.signedShortcutSha256,
    },
  });
}

export class SigningOperation {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (request.method === "GET" && requestUrl.pathname === "/recover") {
      const requestedKey = requestUrl.searchParams.get("idempotencyKey");
      if (!isLowerHex(requestedKey, 64)) return json({ error: "invalid_idempotency_key" }, 400);
      const record = await this.state.storage.get<OperationRecord>(RECORD_KEY);
      if (!record) return json({ error: "operation_not_found" }, 404);
      if (record.idempotencyKey !== requestedKey) return json({ error: "operation_conflict" }, 409);
      if (record.status !== "completed") return json({ error: "operation_ambiguous" }, 409);
      const signed = await this.state.storage.get<ArrayBuffer>(SIGNED_BYTES_KEY);
      if (!signed || await sha256Hex(new Uint8Array(signed)) !== record.signedShortcutSha256) {
        return json({ error: "stored_receipt_invalid" }, 500);
      }
      return signedShortcutResponse(record, signed);
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let payload: SignRequest;
    try {
      payload = await validatePayload(await request.json());
    } catch (error) {
      if (error instanceof ServiceError) return json({ error: error.code }, error.status);
      return json({ error: "invalid_request" }, 400);
    }

    const durableReceiptId = `wht-receipt-${payload.idempotencyKey}`;
    const pending: OperationRecord = {
      schemaVersion: 2,
      status: "pending",
      idempotencyKey: payload.idempotencyKey,
      sourceCommit: payload.sourceCommit,
      targetOriginSha256: payload.targetOriginSha256,
      manifestSha256: payload.manifestSha256,
      wireSha256: payload.wireSha256,
      durableReceiptId,
    };
    const claim = await this.state.storage.transaction(async transaction => {
      const existing = await transaction.get<OperationRecord>(RECORD_KEY);
      if (existing) return { record: existing, claimed: false };
      await transaction.put(RECORD_KEY, pending);
      return { record: pending, claimed: true };
    });
    if (!immutableMatches(claim.record, payload)) return json({ error: "operation_conflict" }, 409);
    if (claim.record.status === "completed") {
      const signed = await this.state.storage.get<ArrayBuffer>(SIGNED_BYTES_KEY);
      if (!signed || await sha256Hex(new Uint8Array(signed)) !== claim.record.signedShortcutSha256) {
        return json({ error: "stored_receipt_invalid" }, 500);
      }
      return json(receipt(claim.record));
    }
    if (!claim.claimed) return json({ error: "operation_ambiguous" }, 409);

    let signed: Uint8Array;
    try {
      signed = await sendHubSignOnce(this.env, payload.wireBytes);
    } catch (error) {
      await this.state.storage.put(RECORD_KEY, { ...pending, status: "ambiguous" });
      if (error instanceof ServiceError) return json({ error: error.code }, error.status);
      return json({ error: "ambiguous_signer_result" }, 502);
    }

    const completed: OperationRecord = {
      ...pending,
      status: "completed",
      signedShortcutSha256: await sha256Hex(signed),
    };
    try {
      await this.state.storage.transaction(async transaction => {
        await transaction.put(SIGNED_BYTES_KEY, signed.buffer.slice(signed.byteOffset, signed.byteOffset + signed.byteLength));
        await transaction.put(RECORD_KEY, completed);
      });
    } catch {
      // The provider intent is already committed; never invoke it again.
      try { await this.state.storage.put(RECORD_KEY, { ...pending, status: "ambiguous" }); } catch { /* durable storage is unavailable */ }
      return json({ error: "receipt_persistence_failed" }, 500);
    }
    return json(receipt(completed), 201);
  }
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  const configured = env.WHT_SIGNING_RECEIPT_TOKEN;
  const authorization = request.headers.get("authorization");
  if (!configured || !authorization || !authorization.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  return supplied.length > 0 && await equalSecret(supplied, configured);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url);
    const path = requestUrl.pathname;
    if (path !== "/sign" && path !== "/recover") return json({ error: "not_found" }, 404);
    if (!(await authorized(request, env))) return json({ error: "unauthorized" }, 401);
    if (path === "/recover") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      const idempotencyKey = requestUrl.searchParams.get("idempotencyKey");
      if (!isLowerHex(idempotencyKey, 64)) return json({ error: "invalid_idempotency_key" }, 400);
      const id = env.SIGNING_OPERATIONS.idFromName(idempotencyKey);
      return env.SIGNING_OPERATIONS.get(id).fetch(request);
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_REQUEST_BYTES) return json({ error: "request_too_large" }, 413);
    let payload: SignRequest;
    try {
      payload = await validatePayload(JSON.parse(new TextDecoder().decode(body)));
    } catch (error) {
      if (error instanceof ServiceError) return json({ error: error.code }, error.status);
      return json({ error: "invalid_request" }, 400);
    }
    const id = env.SIGNING_OPERATIONS.idFromName(payload.idempotencyKey);
    return env.SIGNING_OPERATIONS.get(id).fetch("https://operation/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, wireBytes: undefined }),
    });
  },
};
