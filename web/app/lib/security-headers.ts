import type { NextResponse } from "next/server";

export const STRICT_TRANSPORT_SECURITY_HEADER = "Strict-Transport-Security";
export const CONTENT_SECURITY_POLICY_HEADER = "Content-Security-Policy";
export const X_FRAME_OPTIONS_HEADER = "X-Frame-Options";
export const REFERRER_POLICY_HEADER = "Referrer-Policy";

export const GLOBAL_SECURITY_HEADERS = {
  [STRICT_TRANSPORT_SECURITY_HEADER]: "max-age=31536000; includeSubDomains; preload",
  [CONTENT_SECURITY_POLICY_HEADER]: "frame-ancestors 'none';",
  [X_FRAME_OPTIONS_HEADER]: "DENY",
  [REFERRER_POLICY_HEADER]: "strict-origin-when-cross-origin",
} as const;

export function applySecurityHeaders<T extends NextResponse>(response: T): T {
  for (const [header, value] of Object.entries(GLOBAL_SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
  return response;
}
