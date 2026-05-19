export interface ParsedTokens {
  date: string;
  tokens: number;
}

export function parseClaudeLine(line: string): ParsedTokens | null {
  if (!line.trim()) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const ts = o.timestamp;
  const message = o.message as Record<string, unknown> | undefined;
  const usage = message?.usage as Record<string, unknown> | undefined;
  if (typeof ts !== 'string' || !usage) return null;
  const tokens =
    asInt(usage.input_tokens) +
    asInt(usage.output_tokens) +
    asInt(usage.cache_creation_input_tokens) +
    asInt(usage.cache_read_input_tokens);
  if (tokens <= 0) return null;
  return { date: localDateOf(ts), tokens };
}

function asInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function localDateOf(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`localDateOf: invalid timestamp ${isoUtc}`);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
