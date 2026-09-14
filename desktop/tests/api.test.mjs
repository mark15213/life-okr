import test from 'node:test';
import assert from 'node:assert/strict';
import api from '../api.cjs';
import uploads from '../focus-upload.cjs';

test('desktop API accepts existing recording routes and rejects arbitrary destinations and privileged APIs', () => {
  assert.equal(api.validateRequest({ path: '/api/records?days=365' }).method, 'GET');
  assert.equal(api.validateRequest({ path: '/api/vault?id=3', method: 'DELETE' }).method, 'DELETE');
  assert.equal(api.validateRequest({ path: '/api/ticktick/tasks/abc/complete', method: 'POST' }).method, 'POST');
  for (const path of ['https://example.com/api/vault', '//example.com/api/vault', '/api/auth/../tokens', '/api/ticktick/focus', '/api/admin', '/api/vault#x']) {
    assert.throws(() => api.validateRequest({ path, method: 'POST' }));
  }
  assert.throws(() => api.validateRequest({ path: '/api/vault', method: 'POST', body: 'x'.repeat(100001) }));
  assert.throws(() => api.serverURL('http://example.com'));
  assert.throws(() => api.serverURL('https://user:secret@example.com'));
});

test('focus upload combines short task switches, excludes gaps and local tasks, and retries with stable IDs', () => {
  const server = 'https://example.com';
  const taskId = `ticktick:${encodeURIComponent(server)}:abc`;
  const round = { id: 'round', cloudServer: server, segments: [
    { taskId, title: 'A', startedAt: 100000, durationMs: 40000 },
    { taskId: 'local:a', title: 'Local', startedAt: 140000, durationMs: 100000 },
    { taskId, title: 'A', startedAt: 240000, durationMs: 40000 },
  ] };
  const [entry] = uploads.focusUploads(round);
  assert.match(entry.sessionId, /^[a-f0-9]{24}$/);
  assert.equal(entry.pausedSeconds, 100);
  assert.equal((entry.endedAt - entry.startedAt) / 1000 - entry.pausedSeconds, 80);
  assert.deepEqual(uploads.focusUploads(round), [entry]);
  assert.deepEqual(uploads.focusUploads({ ...round, cloudServer: undefined }), []);
});

test('focus records crossing Shanghai midnight split into bounded calendar days', () => {
  const server = 'https://example.com';
  const entries = uploads.focusUploads({ id: 'night', cloudServer: server, segments: [{
    taskId: `ticktick:${encodeURIComponent(server)}:abc`, title: 'A',
    startedAt: Date.parse('2026-09-13T23:58:00+08:00'), durationMs: 240000,
  }] });
  assert.equal(entries.length, 2);
  assert.equal(entries.reduce((sum, e) => sum + e.endedAt - e.startedAt, 0), 240000);
});
