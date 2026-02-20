export type ParsedBodyType = "json" | "form" | "none";

export type ParsedRequestBody = {
  bodyType: ParsedBodyType;
  body: Record<string, any>;
  invalidJson: boolean;
};

export async function parseRequestBody(req: Request): Promise<ParsedRequestBody> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { bodyType: "json", body: {}, invalidJson: true };
      }
      return { bodyType: "json", body: parsed as Record<string, any>, invalidJson: false };
    } catch {
      return { bodyType: "json", body: {}, invalidJson: true };
    }
  }

  if (contentType.includes("form")) {
    const form = await req.formData();
    return { bodyType: "form", body: Object.fromEntries(form.entries()), invalidJson: false };
  }

  return { bodyType: "none", body: {}, invalidJson: false };
}

export function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function parseBooleanInput(value: unknown): boolean | null {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}
