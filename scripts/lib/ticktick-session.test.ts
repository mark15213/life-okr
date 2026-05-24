import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadSession, saveSession } from './ticktick-session';

async function tmpPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ticktick-session-test-'));
  return path.join(dir, 'session.json');
}

test('loadSession returns null when file does not exist', async () => {
  const p = await tmpPath();
  assert.equal(await loadSession(p), null);
});

test('saveSession then loadSession round-trips', async () => {
  const p = await tmpPath();
  await saveSession(p, { cookie: 't=abc123; Path=/' });
  const loaded = await loadSession(p);
  assert.deepEqual(loaded, { cookie: 't=abc123; Path=/' });
});

test('loadSession returns null when file is malformed JSON', async () => {
  const p = await tmpPath();
  await fs.writeFile(p, 'not json{');
  assert.equal(await loadSession(p), null);
});
