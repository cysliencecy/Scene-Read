import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const port = 4950 + Math.floor(Math.random() * 30);
const base = `http://127.0.0.1:${port}`;
let server: ChildProcess;
const request = async (pathname: string, init?: RequestInit) => {
  const response = await fetch(`${base}${pathname}`, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  return { response, body: await response.json() as Record<string, any> };
};
const config = (version: number) => ({
  schemaVersion: 1, sourceId: 'registry.example', name: 'Registry Example', version, domains: ['books.example.com'],
  search: { request: { url: 'https://books.example.com/search', query: { q: '{{query}}' } }, response: { format: 'json', list: { type: 'jsonpath', value: '$.items[*]' }, fields: { id: { type: 'jsonpath', value: '$.id' } } } },
  detail: { request: { url: 'https://books.example.com/{{bookId}}' }, response: { format: 'json', fields: { title: { type: 'jsonpath', value: '$.title' } } } },
  catalog: { request: { url: 'https://books.example.com/{{bookId}}/catalog' }, response: { format: 'json', list: { type: 'jsonpath', value: '$.items[*]' }, fields: { id: { type: 'jsonpath', value: '$.id' } } } },
  chapter: { request: { url: 'https://books.example.com/chapter/{{chapterId}}' }, response: { format: 'json', fields: { content: { type: 'jsonpath', value: '$.content' } } } },
});

before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: path.resolve('.'), env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', WORKER_AUTO_RUN: 'false' }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 80; attempt += 1) { try { if ((await fetch(`${base}/health`)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error('server start failed');
});
after(async () => { if (server.exitCode === null) { server.kill(); await once(server, 'exit'); } });

test('private source import is versioned, disabled by default, and cannot enable before preview validation', async () => {
  const first = await request('/debug/book-sources/import', { method: 'POST', body: JSON.stringify(config(1)) });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.data.source.enabled, false);
  const enable = await request('/debug/book-sources/registry.example/versions/1/enable', { method: 'POST', body: '{}' });
  assert.equal(enable.response.status, 409);
  assert.equal(enable.body.error, 'BOOK_SOURCE_VALIDATION_REQUIRED');
  const duplicate = await request('/debug/book-sources/import', { method: 'POST', body: JSON.stringify(config(1)) });
  assert.equal(duplicate.response.status, 422);
  const second = await request('/debug/book-sources/import', { method: 'POST', body: JSON.stringify(config(2)) });
  assert.equal(second.response.status, 201);
  const removed = await request('/debug/book-sources/registry.example', { method: 'DELETE' });
  assert.equal(removed.body.data.removed, true);
});
