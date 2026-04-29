function getFirstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function getRequestOrigin(req: Request) {
  const requestUrl = new URL(req.url);
  const forwardedHost = getFirstHeaderValue(req.headers.get("x-forwarded-host"));
  if (!forwardedHost) {
    return requestUrl.origin;
  }

  const forwardedProto = getFirstHeaderValue(req.headers.get("x-forwarded-proto")) || requestUrl.protocol.replace(/:$/, "");
  return `${forwardedProto}://${forwardedHost}`;
}

function isWildcardBindHost(hostname: string) {
  return hostname === "0.0.0.0" || hostname === "::" || hostname === "0:0:0:0:0:0:0:0";
}

export function getPublicRequestOrigin(req: Request, configuredUrl?: string | null) {
  const value = configuredUrl?.trim().replace(/\/+$/, "") || "";
  if (value) {
    try {
      const parsed = new URL(value);
      if (!isWildcardBindHost(parsed.hostname)) {
        return parsed.origin;
      }
    } catch {
      // Fall back to the request origin below.
    }
  }

  return getRequestOrigin(req).replace(/\/+$/, "");
}
