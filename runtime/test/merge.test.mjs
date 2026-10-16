import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDeclared, applySeed, deepMerge } from '../lib/merge.mjs';

test('deepMerge: later layers win, arrays are replaced', () => {
  const out = deepMerge({ a: 1, nested: { x: 1, list: [1, 2] } }, { nested: { y: 2, list: [3] } }, undefined);
  assert.deepEqual(out, { a: 1, nested: { x: 1, y: 2, list: [3] } });
});

test('applyDeclared: writes declared keys and keeps keys the tool owns', () => {
  const current = { theme: 'dark', env: { USER_VAR: '1' } };
  const next = applyDeclared(current, { env: { DISABLE_AUTOUPDATER: '1' } }, undefined);
  assert.deepEqual(next, { theme: 'dark', env: { USER_VAR: '1', DISABLE_AUTOUPDATER: '1' } });
});

test('applyDeclared: declared keys override a changed native value', () => {
  const next = applyDeclared({ model: 'old' }, { model: 'new' }, { model: 'old' });
  assert.equal(next.model, 'new');
});

test('applyDeclared: removes keys no longer declared and prunes empty parents', () => {
  const last = { permissions: { deny: ['Read(./.env)'] } };
  const current = { permissions: { deny: ['Read(./.env)'] }, theme: 'dark' };
  assert.deepEqual(applyDeclared(current, {}, last), { theme: 'dark' });
});

test('applyDeclared: keeps an undeclared key the user changed since the last apply', () => {
  const last = { model: 'sonnet' };
  const current = { model: 'opus' };
  assert.deepEqual(applyDeclared(current, {}, last), { model: 'opus' });
});

test('applyDeclared: atomic paths replace whole entries', () => {
  const atomic = [['mcpServers', '*']];
  const current = { mcpServers: { db: { command: 'old', env: { A: '1' } }, mine: { command: 'x' } } };
  const desired = { mcpServers: { db: { command: 'new' } } };
  const last = { mcpServers: { db: { command: 'old', env: { A: '1' } }, gone: { command: 'g' } } };
  const next = applyDeclared({ ...current, mcpServers: { ...current.mcpServers, gone: { command: 'g' } } }, desired, last, { atomic });
  assert.deepEqual(next.mcpServers, { db: { command: 'new' }, mine: { command: 'x' } });
});

test('applySeed: only fills missing keys', () => {
  assert.deepEqual(applySeed({ a: 1 }, { a: 2, b: { c: 3 } }), { a: 1, b: { c: 3 } });
});
