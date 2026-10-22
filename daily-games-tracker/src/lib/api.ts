export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.headers.get("Content-Type")?.includes("application/json")) {
    throw new Error("Open this page again and sign in to continue.");
  }
  const body = await response.json();
  if (!response.ok) {
    throw new ApiRequestError(
      `${body.error_message ?? "The request could not be completed."}${body.request_id ? ` (${body.request_id})` : ""}`,
      response.status,
    );
  }
  return body as T;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
