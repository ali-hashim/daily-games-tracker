export function applySharePreview(response: Response, request: Request): Response {
  if (
    !["GET", "HEAD"].includes(request.method) ||
    response.status !== 200 ||
    !response.body ||
    !response.headers.get("Content-Type")?.toLowerCase().includes("text/html")
  ) {
    return response;
  }

  // Resolve against the serving origin only, never an invitation path or query string.
  const imageUrl = new URL("/share-preview.png", request.url).href;
  return new HTMLRewriter()
    .on('meta[property="og:image"], meta[name="twitter:image"]', {
      element(element) {
        element.setAttribute("content", imageUrl);
      },
    })
    .transform(response);
}
