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

export function parseCodexLine(line: string): ParsedTokens | null {
  if (!line.trim()) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (o.type !== 'event_msg') return null;
  const payload = o.payload as Record<string, unknown> | undefined;
  if (!payload || payload.type !== 'token_count') return null;
  const info = payload.info as Record<string, unknown> | undefined;
  const last = info?.last_token_usage as Record<string, unknown> | undefined;
  const tokens = typeof last?.total_tokens === 'number' ? Math.floor(last.total_tokens) : 0;
  if (tokens <= 0) return null;
  const ts = o.timestamp;
  if (typeof ts !== 'string') return null;
  return { date: localDateOf(ts), tokens };
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
