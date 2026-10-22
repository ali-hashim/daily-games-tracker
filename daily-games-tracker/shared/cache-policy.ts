const NETWORK_ONLY_ROOTS = ["/api", "/admin", "/register", "/login"] as const;
const APP_SHELL_FILES = new Set([
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
]);
const APP_SHELL_DESTINATIONS = new Set(["font", "image", "manifest", "script", "style"]);

export function isNetworkOnlyPath(pathname: string): boolean {
  return NETWORK_ONLY_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export function isAppShellAsset(pathname: string, destination: string): boolean {
  if (isNetworkOnlyPath(pathname)) return false;
  return APP_SHELL_FILES.has(pathname) || APP_SHELL_DESTINATIONS.has(destination);
}
