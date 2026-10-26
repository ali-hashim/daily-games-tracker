const USER_PATH = "/user";
const DATE_PATH = /^\/daily\/(\d{4}-\d{2}-\d{2})$/;
const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!DATE_VALUE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function appOrigin(): string {
  return typeof window === "undefined" ? "https://wht.invalid" : window.location.origin;
}

/** Return only the server-accepted, same-origin destinations used by login. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value) return USER_PATH;
  if (!value.startsWith("/") && !value.startsWith(`${appOrigin()}/`)) return USER_PATH;

  try {
    const url = new URL(value, appOrigin());
    if (url.origin !== appOrigin() || url.search || url.hash) return USER_PATH;
    if (url.pathname === USER_PATH || url.pathname === `${USER_PATH}/`) return USER_PATH;

    const dateMatch = url.pathname.match(DATE_PATH);
    if (dateMatch && validDate(dateMatch[1])) return `/daily/${dateMatch[1]}`;
  } catch {
    // Invalid URL syntax is an invalid return target.
  }

  return USER_PATH;
}

/** Preserve a dated Daily page when its legacy query form is still in the address bar. */
export function safeDailyReturnPath(
  pathname = typeof window === "undefined" ? USER_PATH : window.location.pathname,
  search = typeof window === "undefined" ? "" : window.location.search,
): string {
  const directPath = safeReturnPath(pathname);
  if (directPath !== USER_PATH) return directPath;

  if (pathname === "/daily") {
    const date = new URLSearchParams(search).get("date");
    if (date && validDate(date)) return `/daily/${date}`;
  }
  return USER_PATH;
}
