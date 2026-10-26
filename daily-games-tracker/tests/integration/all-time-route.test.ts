import { describe, expect, it } from "vitest";
import { onRequest as allTimePage } from "../../functions/all-time";
import { getPage } from "../../src/App";

describe("canonical all-time browser route", () => {
  it("redirects the exact route to the trailing-slash path without caching", async () => {
    const response = await allTimePage({
      request: new Request("https://wht.test/all-time"),
      next: async () => new Response("shell"),
      env: {} as Parameters<typeof allTimePage>[0]["env"],
      data: {},
    } as Parameters<typeof allTimePage>[0]);
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/all-time/");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("delegates the trailing-slash route to the SPA shell", async () => {
    const shellResponse = new Response("shell");
    const response = await allTimePage({
      request: new Request("https://wht.test/all-time/"),
      next: async () => shellResponse,
      env: {} as Parameters<typeof allTimePage>[0]["env"],
      data: {},
    } as Parameters<typeof allTimePage>[0]);

    expect(response).toBe(shellResponse);
  });

  it("classifies the trailing-slash path as all-time", () => {
    expect(getPage("/all-time/")).toBe("all-time");
  });
});
