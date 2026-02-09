function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

export function getRequestOrigin(req: Request): string {
  const fallback = new URL(req.url);
  const proto = firstHeaderValue(req.headers.get("x-forwarded-proto")) || fallback.protocol.replace(":", "");
  const host = firstHeaderValue(req.headers.get("x-forwarded-host"));
  const port = firstHeaderValue(req.headers.get("x-forwarded-port"));

  if (!host) {
    return fallback.origin;
  }

  const hostHasPort = host.includes(":");
  const hasStandardPort = (proto === "https" && port === "443") || (proto === "http" && port === "80");
  const hostWithPort = !hostHasPort && port && !hasStandardPort ? `${host}:${port}` : host;
  return `${proto}://${hostWithPort}`;
}

export function toAppUrl(req: Request, path: string): URL {
  return new URL(path, getRequestOrigin(req));
}
