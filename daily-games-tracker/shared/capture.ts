import type { CaptureInput, SharedTextCapture } from "./types";
import { fail } from "../parsers/errors";

export const CAPTURE_LIMITS = {
  textBytes: 100 * 1024,
  serializedBytes: 256 * 1024,
  nodes: 5_000,
} as const;

const encoder = new TextEncoder();
const invalidText = /[\uD800-\uDFFF\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const nodeTag = /^[A-Za-z][A-Za-z0-9-]*$/;
const sharedFields = ["capture_schema", "source_kind", "shared_text"];
const safariFields = [
  "capture_schema",
  "source_kind",
  "source_url",
  "page_title",
  "visible_text",
  "visible_nodes",
];
const nodeFields = ["tag", "id", "class", "text"];
const sharedJsonBytes = JSON.stringify({
  capture_schema: "dgt.capture.v1",
  source_kind: "shared_text",
  shared_text: "",
}).length;
const safariJsonBytes = JSON.stringify({
  capture_schema: "dgt.capture.v1",
  source_kind: "safari_webpage",
  source_url: "",
  page_title: "",
  visible_text: "",
  visible_nodes: [],
}).length;
const nodeJsonBytes = JSON.stringify({ tag: "", id: "", class: "", text: "" }).length;

export const utf8Bytes = (value: string): number => encoder.encode(value).byteLength;
export const normalizeLineEndings = (value: string): string => value.replace(/\r\n?/g, "\n");

export function sharedTextCapture(text: string): SharedTextCapture {
  const capture: SharedTextCapture = {
    capture_schema: "dgt.capture.v1",
    source_kind: "shared_text",
    shared_text: normalizeLineEndings(text),
  };
  assertCapture(capture);
  return capture;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== expected.length) return false;
  for (const key of actual) if (!expected.includes(key)) return false;
  return true;
}

// Exact JSON string-content bytes, after validText has rejected lone surrogates
// and controls other than tab/LF/CR. Avoid a second object graph and UTF-8 buffer.
function jsonTextBytes(value: string): number {
  let bytes = value.length;
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit === 34 || unit === 92 || unit === 9 || unit === 10 || unit === 13) bytes++;
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      bytes += 2;
      index++;
    } else if (unit >= 0x800) bytes += 2;
    else if (unit >= 0x80) bytes++;
  }
  return bytes;
}

function validText(value: unknown, maxBytes: number): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxBytes &&
    (value.length === 0 ||
      (!invalidText.test(value) && (value.length * 3 <= maxBytes || utf8Bytes(value) <= maxBytes)))
  );
}

// Unknown JSON is checked before any game interpretation. No captures are logged or persisted.
export function assertCapture(value: unknown): asserts value is CaptureInput {
  if (!record(value)) fail("CAPTURE_INVALID");
  if (value.capture_error === "CAPTURE_TOO_LARGE") fail("CAPTURE_TOO_LARGE");
  if (value.capture_schema !== "dgt.capture.v1") fail("CAPTURE_INVALID");
  let serializedBytes: number;
  // Bound fields before serialization; this also prevents recursive input from being stringified.
  if (value.source_kind === "shared_text") {
    if (!keys(value, sharedFields)) fail("CAPTURE_INVALID");
    if (
      typeof value.shared_text === "string" &&
      utf8Bytes(value.shared_text) > CAPTURE_LIMITS.textBytes
    )
      fail("CAPTURE_TOO_LARGE");
    if (!validText(value.shared_text, CAPTURE_LIMITS.textBytes) || !value.shared_text.trim())
      fail("CAPTURE_INVALID");
    serializedBytes = sharedJsonBytes + jsonTextBytes(value.shared_text);
  } else if (value.source_kind === "safari_webpage") {
    if (!keys(value, safariFields)) fail("CAPTURE_INVALID");
    if (
      typeof value.visible_text === "string" &&
      utf8Bytes(value.visible_text) > CAPTURE_LIMITS.textBytes
    )
      fail("CAPTURE_TOO_LARGE");
    if (
      !validText(value.source_url, 4096) ||
      !validText(value.page_title, 1024) ||
      !validText(value.visible_text, CAPTURE_LIMITS.textBytes) ||
      !Array.isArray(value.visible_nodes)
    )
      fail("CAPTURE_INVALID");
    if (value.visible_nodes.length > CAPTURE_LIMITS.nodes) fail("CAPTURE_TOO_LARGE");
    try {
      const url = new URL(value.source_url);
      if (url.protocol !== "https:" || url.username || url.password) fail("CAPTURE_INVALID");
    } catch {
      fail("CAPTURE_INVALID");
    }
    serializedBytes =
      safariJsonBytes +
      jsonTextBytes(value.source_url) +
      jsonTextBytes(value.page_title) +
      jsonTextBytes(value.visible_text);
    if (value.visible_nodes.length) serializedBytes += value.visible_nodes.length - 1;
    // Code-unit length is a cheap lower bound. Stop before serializing an aggregate
    // above the budget; the final UTF-8 check includes JSON escaping and overhead.
    let fieldLength = value.visible_text.length;
    for (const node of value.visible_nodes) {
      if (
        !record(node) ||
        !keys(node, nodeFields) ||
        typeof node.tag !== "string" ||
        node.tag.length > 32 ||
        !nodeTag.test(node.tag) ||
        !validText(node.id, 1024) ||
        !validText(node.class, 1024) ||
        !validText(node.text, CAPTURE_LIMITS.textBytes)
      )
        fail("CAPTURE_INVALID");
      fieldLength += node.tag.length + node.id.length + node.class.length + node.text.length;
      if (fieldLength > CAPTURE_LIMITS.serializedBytes) fail("CAPTURE_TOO_LARGE");
      serializedBytes +=
        nodeJsonBytes +
        node.tag.length +
        jsonTextBytes(node.id) +
        jsonTextBytes(node.class) +
        jsonTextBytes(node.text);
    }
  } else fail("CAPTURE_INVALID");
  if (serializedBytes > CAPTURE_LIMITS.serializedBytes) fail("CAPTURE_TOO_LARGE");
}
