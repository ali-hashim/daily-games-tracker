import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const isOutside = (relativePath) =>
  relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);

/**
 * Verify that a generated path and any existing symlink parents stay inside
 * the intended boundary before it is removed or written.
 */
export async function assertSafeGeneratedPath(target, boundary, { allowBoundary = false } = {}) {
  const targetAbsolute = resolve(target);
  const boundaryAbsolute = resolve(boundary);
  const boundaryReal = await realpath(boundaryAbsolute);
  const targetStat = await lstat(targetAbsolute).catch(() => null);
  if (targetStat?.isSymbolicLink()) throw new Error(`Refusing symlinked generated path: ${targetAbsolute}`);

  let targetReal;
  try {
    targetReal = await realpath(targetAbsolute);
  } catch {
    const parentReal = await realpath(dirname(targetAbsolute));
    targetReal = resolve(parentReal, basename(targetAbsolute));
  }
  const relativePath = relative(boundaryReal, targetReal);
  if (isOutside(relativePath) || (!allowBoundary && relativePath === ""))
    throw new Error(`Generated path escapes its boundary: ${targetAbsolute}`);
  return targetAbsolute;
}
