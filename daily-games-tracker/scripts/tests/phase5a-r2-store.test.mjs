import assert from "node:assert/strict";
import test from "node:test";
import { createR2PrivateStore } from "../phase5a-r2-private-store.mjs";

const config = {
  accountId: "a".repeat(32),
  bucketName: "private-signing-fixture",
  accessKeyId: "synthetic-access-key",
  secretAccessKey: "synthetic-secret-key",
};

function response(body = "", status = 200) {
  return new Response(body, { status });
}

test("verified put waits for a digest-checked R2 readback", async () => {
  const calls = [];
  let stored;
  const store = createR2PrivateStore({
    ...config,
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      if (options.method === "PUT") {
        stored = Buffer.from(options.body);
        return response("", 200);
      }
      return response(stored, 200);
    },
    now: () => new Date("2026-10-27T19:00:00.000Z"),
    sleep: async () => {},
  });
  const body = Buffer.from('{"status":"private"}');

  await store.putVerified("signing/intents/operation.json", body, "application/json");

  assert.deepEqual(
    calls.map((call) => call.options.method),
    ["PUT", "GET"],
  );
  assert.deepEqual(Buffer.from(calls[1].options.body || ""), Buffer.alloc(0));
  assert.equal(
    calls[0].options.headers["x-amz-content-sha256"],
    "2cf56ef1366e46e81c5b9d4172cd26b72db5eb9a8b0d7624dee269e43cfe8eff",
  );
  assert.equal(
    calls[1].options.headers["x-amz-content-sha256"],
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.match(
    calls[0].options.headers.authorization,
    /^AWS4-HMAC-SHA256 Credential=synthetic-access-key\//,
  );
  assert.equal(
    calls[0].options.headers.authorization,
    "AWS4-HMAC-SHA256 Credential=synthetic-access-key/20261027/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=4afe6f4a45f83a49cb8528442e10e7af683675020efd75a202341638d9909da3",
  );
  assert.equal(stored.toString("utf8"), body.toString("utf8"));
});

test("verified put rejects an R2 readback whose bytes do not match the upload digest", async () => {
  const methods = [];
  const store = createR2PrivateStore({
    ...config,
    fetch: async (_url, options) => {
      methods.push(options.method);
      return options.method === "PUT" ? response("", 200) : response("different bytes", 200);
    },
    sleep: async () => {},
  });

  await assert.rejects(
    store.putVerified(
      "shortcuts/commit/digest.shortcut",
      Buffer.from("signed bytes"),
      "application/octet-stream",
    ),
    /R2 object digest verification failed/,
  );
  assert.deepEqual(methods, ["PUT", "GET"]);
});

test("transient R2 failures use four attempts with exponential backoff", async () => {
  const delays = [];
  let attempts = 0;
  const store = createR2PrivateStore({
    ...config,
    fetch: async () => {
      attempts += 1;
      return attempts < 3 ? response("", 503) : response("ok", 200);
    },
    retryDelayMs: 25,
    sleep: async (delay) => delays.push(delay),
  });

  assert.equal((await store.get("signing/state.json")).toString("utf8"), "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [25, 50]);
});

test("transient GET response-body failures retry within the same four-attempt budget", async () => {
  const delays = [];
  let attempts = 0;
  const store = createR2PrivateStore({
    ...config,
    fetch: async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("transient body failure"));
            },
          }),
          { status: 200 },
        );
      }
      return response("body recovered", 200);
    },
    retryDelayMs: 10,
    sleep: async (delay) => delays.push(delay),
  });

  assert.equal((await store.get("signing/state.json")).toString("utf8"), "body recovered");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("exhausted transient GET response-body failures use all four attempts and stay generic", async () => {
  let attempts = 0;
  const store = createR2PrivateStore({
    ...config,
    fetch: async () => {
      attempts += 1;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("private provider detail"));
          },
        }),
        { status: 200 },
      );
    },
    sleep: async () => {},
  });

  await assert.rejects(store.get("signing/state.json"), (error) => {
    assert.equal(error.message, "R2 private storage request failed");
    assert.doesNotMatch(error.message, /private provider detail/);
    return true;
  });
  assert.equal(attempts, 4);
});

test("successful PUT response bodies are cancelled before readback", async () => {
  let putBodyCancelled = false;
  const store = createR2PrivateStore({
    ...config,
    fetch: async (_url, options) => {
      if (options.method === "PUT") {
        return new Response(
          new ReadableStream({
            cancel() {
              putBodyCancelled = true;
            },
          }),
          { status: 200 },
        );
      }
      return response("signed bytes", 200);
    },
    sleep: async () => {},
  });

  await store.putVerified("shortcuts/commit/digest.shortcut", Buffer.from("signed bytes"));
  assert.equal(putBodyCancelled, true);
});

test("retryable R2 responses are cancelled before the next attempt", async () => {
  let cancelled = false;
  let attempts = 0;
  const store = createR2PrivateStore({
    ...config,
    fetch: async () => {
      attempts += 1;
      if (attempts > 1) return response("ok", 200);
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        { status: 503 },
      );
    },
    sleep: async () => {},
  });

  await store.get("signing/state.json");

  assert.equal(cancelled, true);
  assert.equal(attempts, 2);
});

test("exhausted R2 retries fail with a generic error that omits credentials and endpoint", async () => {
  let attempts = 0;
  const store = createR2PrivateStore({
    ...config,
    fetch: async () => {
      attempts += 1;
      throw new Error("network failure");
    },
    sleep: async () => {},
  });

  await assert.rejects(store.get("signing/state.json"), (error) => {
    assert.equal(error.message, "R2 private storage request failed");
    assert.equal(error.message.includes(config.secretAccessKey), false);
    assert.equal(error.message.includes(`${config.accountId}.r2.cloudflarestorage.com`), false);
    return true;
  });
  assert.equal(attempts, 4);
});

test("optional reads treat only a missing object as absent", async () => {
  const store = createR2PrivateStore({
    ...config,
    fetch: async () => response("", 404),
    sleep: async () => {},
  });
  assert.equal(await store.getOptional("signing/optional.json"), null);
});

test("requests disable redirects and carry a cancellation signal", async () => {
  let requestOptions;
  const store = createR2PrivateStore({
    ...config,
    fetch: async (_url, options) => {
      requestOptions = options;
      return response("redirect", 302);
    },
    sleep: async () => {},
  });

  await assert.rejects(store.get("signing/state.json"), /R2 private storage request failed/);
  assert.equal(requestOptions.redirect, "manual");
  assert.ok(requestOptions.signal instanceof AbortSignal);
});

test("private objects are size bounded before upload and while reading streamed responses", async () => {
  let fetchCalls = 0;
  const store = createR2PrivateStore({
    ...config,
    fetch: async () => {
      fetchCalls += 1;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(16 * 1024 * 1024));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    },
    sleep: async () => {},
  });

  await assert.rejects(
    store.putVerified("signing/too-large.json", Buffer.alloc(16 * 1024 * 1024 + 1)),
    /R2 private storage object is too large/,
  );
  assert.equal(fetchCalls, 0);
  await assert.rejects(
    store.get("signing/too-large.json"),
    /R2 private storage object is too large/,
  );
  assert.equal(fetchCalls, 1);
});
