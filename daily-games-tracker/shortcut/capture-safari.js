/* Paste this entire file into Run JavaScript on Web Page. No game-specific selectors. */
(() => {
  const MAX_TEXT = 100 * 1024;
  const MAX_CAPTURE = 256 * 1024;
  const MAX_NODES = 5000;
  const encoder = new TextEncoder();
  const bytes = (value) => encoder.encode(value).byteLength;
  const clean = (value) => value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/gu, " ");
  const excluded = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "SVG",
    "CANVAS",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "INPUT",
    "TEXTAREA",
    "SELECT",
    "OPTION",
    "FORM",
  ]);
  const output = [];
  const nodes = [];
  let textBytes = 0;
  let visited = 0;
  const started = performance.now();
  const append = (value) => {
    textBytes += bytes(value);
    if (textBytes > MAX_TEXT) throw new Error("CAPTURE_TOO_LARGE");
    output.push(value);
  };
  try {
    const stack = [{ element: document.body, exit: false }];
    while (stack.length) {
      if (++visited > 40000 || performance.now() - started > 1500)
        throw new Error("CAPTURE_TOO_LARGE");
      const item = stack.pop();
      if (item.text !== undefined) {
        append(item.text);
        continue;
      }
      if (item.exit) {
        if (item.block) append("\n");
        continue;
      }
      const element = item.element;
      const tag = element?.tagName?.toUpperCase();
      if (
        !element ||
        excluded.has(tag) ||
        element.hidden ||
        element.hasAttribute("inert") ||
        element.getAttribute("aria-hidden") === "true" ||
        element.isContentEditable
      )
        continue;
      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        Number(style.opacity) === 0 ||
        style.contentVisibility === "hidden"
      )
        continue;
      // Screen-reader-only content commonly uses a zero-area CSS clip rectangle.
      const clip = /^rect\(([-\d.]+)px[, ]+([-\d.]+)px[, ]+([-\d.]+)px[, ]+([-\d.]+)px\)$/.exec(
        style.clip || "",
      );
      if (clip && (Number(clip[2]) <= Number(clip[4]) || Number(clip[3]) <= Number(clip[1])))
        continue;
      if (/^inset\(50%(?:\s+50%){0,3}\)$/.test(style.clipPath || "")) continue;
      // A rendered BR often has zero width; it still supplies a meaningful line break.
      if (tag === "BR") {
        append("\n");
        continue;
      }
      // A zero-size container may hold visible fixed/absolute children. Traverse it,
      // but omit its own text unless it has a rendered box or uses display:contents.
      const captureOwnText =
        style.display === "contents" ||
        Array.from(element.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
      const block = !/^(inline|inline-block|contents)$/.test(style.display);
      if (block) append("\n");
      stack.push({ exit: true, block });
      const children = Array.from(element.childNodes);
      // Closed details expose their summary only. Never read a hidden subtree's textContent.
      const allowed =
        tag === "DETAILS" && !element.open
          ? children.filter(
              (child) => child.nodeType === 1 && child.tagName.toUpperCase() === "SUMMARY",
            )
          : children;
      let directText = "";
      // Text is emitted in DOM order using stack entries; attribute values and control values are never read.
      for (const child of allowed)
        if (captureOwnText && child.nodeType === 3) directText += clean(child.nodeValue || "");
      if (directText.trim()) {
        nodes.push({
          tag,
          id: (element.id || "").slice(0, 256),
          class: (element.getAttribute("class") || "").slice(0, 256),
          text: directText.trim(),
        });
        if (nodes.length > MAX_NODES) throw new Error("CAPTURE_TOO_LARGE");
      }
      for (let i = allowed.length - 1; i >= 0; i--) {
        const child = allowed[i];
        if (child.nodeType === 1) stack.push({ element: child, exit: false });
        else if (captureOwnText && child.nodeType === 3)
          stack.push({ text: clean(child.nodeValue || "") });
      }
      // Process pending text entries before the next element; keep adjacent inline text intact.
      while (stack.at(-1)?.text !== undefined) append(stack.pop().text);
    }
    const url = new URL(location.href);
    url.username = "";
    url.password = "";
    const capture = {
      capture_schema: "dgt.capture.v1",
      source_kind: "safari_webpage",
      source_url: url.href,
      page_title: document.title,
      visible_text: output
        .join("")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n"),
      visible_nodes: nodes,
    };
    if (
      bytes(capture.source_url) > 4096 ||
      bytes(capture.page_title) > 1024 ||
      bytes(JSON.stringify(capture)) > MAX_CAPTURE
    )
      throw new Error("CAPTURE_TOO_LARGE");
    completion(capture);
  } catch (error) {
    completion({
      capture_schema: "dgt.capture.v1",
      capture_error:
        error.message === "CAPTURE_TOO_LARGE" ? "CAPTURE_TOO_LARGE" : "CAPTURE_INVALID",
    });
  }
})();
