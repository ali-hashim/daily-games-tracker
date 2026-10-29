import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./_worker.js";

for (const [method, path] of [
  ["GET", "/"],
  ["GET", "/admin/players"],
  ["POST", "/api/admin/players"],
  ["POST", "/api/import"],
  ["GET", "/sw.js"],
  ["HEAD", "/user"],
]) {
  test(`${method} ${path} returns an uncached maintenance response`, async () => {
    const response = await worker.fetch(new Request(`https://example.invalid${path}`, { method }));
    assert.equal(response.status, 503);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.match(response.headers.get("content-type"), /text\/plain/);
    if (method === "HEAD") {
      assert.equal(await response.text(), "");
    } else {
      assert.match(await response.text(), /temporarily unavailable/i);
    }
  });
}
