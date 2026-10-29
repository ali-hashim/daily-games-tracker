import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Website share preview", () => {
  let worker: Miniflare | undefined;

  beforeAll(() => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const bundle = buildSync({
      absWorkingDir: root,
      stdin: {
        contents: `import { applySharePreview } from "./functions/_lib/share-preview";
          export default { fetch(request) {
            const response = new URL(request.url).pathname === "/json"
              ? new Response('{"error":"SESSION_REQUIRED"}', { status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
              : new Response(${JSON.stringify(html)}, { headers: { "Content-Type": "text/html; charset=utf-8" } });
            return applySharePreview(response, request);
          } };`,
        resolveDir: root,
      },
      bundle: true,
      write: false,
      format: "esm",
    });
    worker = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: "2026-10-20",
      }),
    );
  });

  afterAll(async () => worker?.dispose());

  it("serves explicit branded metadata without JavaScript or private URL data", async () => {
    const response = await worker!.dispatchFetch(
      "https://preview.example.invalid/register/private-invite?code=private-code",
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('property="og:title" content="Winstitute of Higher Thinking"');
    expect(html).toContain(
      'property="og:image" content="https://preview.example.invalid/share-preview.png"',
    );
    expect(html).toContain(
      'name="twitter:image" content="https://preview.example.invalid/share-preview.png"',
    );
    expect(html).not.toContain("private-invite");
    expect(html).not.toContain("private-code");
    expect(html).not.toContain("player-help/");
  });

  it("leaves protected JSON responses and their status/cache policy unchanged", async () => {
    const response = await worker!.dispatchFetch("https://wht.example.invalid/json");
    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "SESSION_REQUIRED" });
  });
});
