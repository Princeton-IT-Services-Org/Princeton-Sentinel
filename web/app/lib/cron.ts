type Range = { min: number; max: number };

const FIELD_RANGES: Range[] = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 }, // day of week
];

function isInt(raw: string): boolean {
  return /^[0-9]+$/.test(raw);
}

function inRange(value: number, range: Range): boolean {
  return value >= range.min && value <= range.max;
}

function isValidBaseToken(base: string, range: Range): boolean {
  if (base === "*") return true;

  if (isInt(base)) {
    return inRange(Number(base), range);
  }

  if (/^[0-9]+-[0-9]+$/.test(base)) {
    const [startRaw, endRaw] = base.split("-");
    const start = Number(startRaw);
    const end = Number(endRaw);
    return inRange(start, range) && inRange(end, range) && start <= end;
  }

  return false;
}

function isValidSegment(segment: string, range: Range): boolean {
  const [base, stepRaw] = segment.split("/");
  if (!isValidBaseToken(base, range)) return false;
  if (stepRaw === undefined) return true;
  if (!isInt(stepRaw)) return false;
  const step = Number(stepRaw);
  return step > 0;
}

function isValidField(field: string, range: Range): boolean {
  const segments = field.split(",");
  if (!segments.length) return false;
  return segments.every((segment) => isValidSegment(segment.trim(), range));
}

export function isValidCronExpression(expr: string): boolean {
  const normalized = (expr || "").trim();
  if (!normalized) return false;
  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field, index) => isValidField(field, FIELD_RANGES[index]));
}
