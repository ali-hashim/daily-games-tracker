export default {
  fetch(request) {
    return new Response(
      request.method === "HEAD"
        ? null
        : "Service temporarily unavailable. Please try again later.\n",
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff",
        },
      },
    );
  },
};
