const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, '../frontend/scripts/session.js'), 'utf8');
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function tab(localStorage = storage(), fetch = async () => ({ ok: true, json: async () => ({}) })) {
  const context = { localStorage, sessionStorage: storage(), location: { href: 'http://localhost/host.html?sessionId=1', search: '?sessionId=1' }, history: { replaceState() {} }, URL, URLSearchParams, console, setTimeout, clearTimeout, AbortController, fetch };
  const client = vm.runInNewContext(source + '\nTriviaSession;', context);
  return { client, context };
}
test('session memberships do not overwrite or clear other games in the same browser', () => {
  const local = storage();
  const a = tab(local).client, b = tab(local).client;
  a.save({ gameId: 1, teamId: 10, teamName: 'A' });
  b.save({ gameId: 2, teamId: 20, teamName: 'B' });
  assert.equal(a.membership(1).teamId, 10);
  assert.equal(b.membership(2).teamId, 20);
  assert.equal(tab(local).client.membership(1).teamId, 10);
  a.clear(1);
  assert.equal(a.membership(1), null);
  assert.equal(b.membership(2).teamId, 20);
  assert.equal(tab(local).client.membership(2).teamId, 20);
});
test('legacy membership is used only for its matching session and URLs retain context', () => {
  const { client, context } = tab();
  context.localStorage.setItem('gameId', '7'); context.localStorage.setItem('teamId', '42');
  assert.equal(client.membership(8), null);
  assert.equal(client.membership(7).teamId, 42);
  client.save(client.membership(7));
  assert.equal(client.url('questions.html', 7, { q: 3 }), 'questions.html?q=3&sessionId=7');
  assert.equal(client.base(7), '/api/sessions/7');
  assert.throws(() => client.base(null), /select a session/);
  client.clear(7);
  assert.equal(context.localStorage.getItem('gameId'), null);
});
test('failed HTTP saves expose their error status to the host', async () => {
  const { client } = tab(storage(), async () => ({ ok: false, status: 503, json: async () => ({ error: 'Unable to save' }) }));
  await assert.rejects(client.request('/api/sessions/1/answer', { method: 'POST', body: '{}' }), error => error.status === 503 && error.message === 'Unable to save');
});
