import { describe, expect, it } from "vitest";
import { onRequest as loginPage } from "../../functions/login";
import { onRequest as userPage } from "../../functions/user";
import { getPage } from "../../src/App";

describe("User browser routes", () => {
  it.each([
    ["/user", userPage],
    ["/user/", userPage],
    ["/login", loginPage],
    ["/login/", loginPage],
  ] as const)("serves the SPA shell for %s without redirecting home", async (pathname, handler) => {
    const shellResponse = new Response("shell");
    let nextRequest: Request | undefined;
    const response = await handler({
      request: new Request(`https://wht.test${pathname}?return_url=%2Fuser`),
      next: async (request?: Request) => {
        nextRequest = request;
        return shellResponse;
      },
      env: {} as Parameters<typeof handler>[0]["env"],
      data: {},
    } as Parameters<typeof handler>[0]);

    expect(response).toBe(shellResponse);
    expect(nextRequest?.url).toBe(`https://wht.test/?return_url=%2Fuser`);
  });

  it("delegates unrelated paths without rewriting them", async () => {
    let nextRequest: Request | undefined;
    const response = await userPage({
      request: new Request("https://wht.test/daily/2026-10-25"),
      next: async (request?: Request) => {
        nextRequest = request;
        return new Response("daily");
      },
      env: {} as Parameters<typeof userPage>[0]["env"],
      data: {},
    } as Parameters<typeof userPage>[0]);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("daily");
    expect(nextRequest).toBeUndefined();
  });

  it.each(["/user", "/user/", "/login", "/login/"])(
    "classifies %s as the User page",
    (pathname) => {
      expect(getPage(pathname)).toBe("user");
    },
  );
});
