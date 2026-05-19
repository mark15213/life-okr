import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { localDateOf, parseClaudeLine, parseCodexLine } from './token-parsers';

test('localDateOf returns YYYY-MM-DD in process timezone', () => {
  // Use a UTC timestamp known to land on different dates depending on TZ.
  // 2026-05-19T03:00:00Z is May 18 in US Pacific, May 19 in UTC/Asia.
  const out = localDateOf('2026-05-19T03:00:00Z');
  assert.match(out, /^\d{4}-\d{2}-\d{2}$/);
  // Reconstruct the expected local date from the same Date object the impl uses
  const d = new Date('2026-05-19T03:00:00Z');
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(out, expected);
});

test('localDateOf zero-pads single-digit month and day', () => {
  // Pick a UTC instant whose local-date components are single-digit in some TZs.
  // We rebuild the expected string the same way the implementation does, so the
  // test stays portable, but we explicitly assert the digit count of the components.
  const iso = '2026-03-05T12:00:00Z';
  const out = localDateOf(iso);
  const d = new Date(iso);
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(out, expected);
  const [, mm, dd] = out.split('-');
  assert.equal(mm.length, 2);
  assert.equal(dd.length, 2);
});

test('localDateOf throws on invalid input', () => {
  assert.throws(() => localDateOf('not-a-date'));
});

const CLAUDE_LINE_VALID = JSON.stringify({
  timestamp: '2026-05-19T15:30:00Z',
  type: 'assistant',
  message: {
    role: 'assistant',
    usage: {
      input_tokens: 6,
      output_tokens: 113,
      cache_creation_input_tokens: 13154,
      cache_read_input_tokens: 16760,
    },
  },
});

test('parseClaudeLine sums all four token fields', () => {
  const out = parseClaudeLine(CLAUDE_LINE_VALID);
  assert.ok(out);
  assert.equal(out!.tokens, 6 + 113 + 13154 + 16760);
});

test('parseClaudeLine attaches local date from timestamp', () => {
  const out = parseClaudeLine(CLAUDE_LINE_VALID);
  assert.ok(out);
  assert.match(out!.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('parseClaudeLine returns null for user messages (no usage)', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'user',
    message: { role: 'user', content: 'hi' },
  });
  assert.equal(parseClaudeLine(line), null);
});

test('parseClaudeLine returns null for malformed JSON', () => {
  assert.equal(parseClaudeLine('not json'), null);
});

test('parseClaudeLine returns null for empty/whitespace lines', () => {
  assert.equal(parseClaudeLine(''), null);
  assert.equal(parseClaudeLine('   \n'), null);
});

test('parseClaudeLine treats missing token fields as zero', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'assistant',
    message: { role: 'assistant', usage: { input_tokens: 5, output_tokens: 10 } },
  });
  const out = parseClaudeLine(line);
  assert.ok(out);
  assert.equal(out!.tokens, 15);
});

test('parseClaudeLine returns null when computed total is zero', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'assistant',
    message: { role: 'assistant', usage: { input_tokens: 0, output_tokens: 0 } },
  });
  assert.equal(parseClaudeLine(line), null);
});

const CODEX_LINE_VALID = JSON.stringify({
  timestamp: '2026-05-19T15:30:00Z',
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: { total_tokens: 999999 }, // cumulative — must be IGNORED
      last_token_usage: {
        input_tokens: 100,
        cached_input_tokens: 50,
        output_tokens: 200,
        reasoning_output_tokens: 0,
        total_tokens: 350,
      },
      model_context_window: null,
    },
    rate_limits: null,
  },
});

test('parseCodexLine reads last_token_usage.total_tokens (delta), not cumulative', () => {
  const out = parseCodexLine(CODEX_LINE_VALID);
  assert.ok(out);
  assert.equal(out!.tokens, 350);
});

test('parseCodexLine attaches local date from line timestamp', () => {
  const out = parseCodexLine(CODEX_LINE_VALID);
  assert.ok(out);
  assert.match(out!.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('parseCodexLine returns null for session_meta lines', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'session_meta',
    payload: { id: 'abc', cli_version: '0.131.0' },
  });
  assert.equal(parseCodexLine(line), null);
});

test('parseCodexLine returns null for event_msg lines that are not token_count', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'event_msg',
    payload: { type: 'agent_message_delta', text: 'hi' },
  });
  assert.equal(parseCodexLine(line), null);
});

test('parseCodexLine returns null when last_token_usage.total_tokens is missing or zero', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'event_msg',
    payload: { type: 'token_count', info: { last_token_usage: { total_tokens: 0 } } },
  });
  assert.equal(parseCodexLine(line), null);
});

test('parseCodexLine returns null for malformed JSON', () => {
  assert.equal(parseCodexLine('{nope'), null);
});

test('parseCodexLine returns null for empty lines', () => {
  assert.equal(parseCodexLine(''), null);
});
