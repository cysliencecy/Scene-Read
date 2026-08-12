import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const port = 4700 + Math.floor(Math.random() * 200);
const apiUrl = `http://127.0.0.1:${port}`;
let server: ChildProcess;

async function request(pathname: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  return { response, body: await response.json() as Record<string, any> };
}

before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      PORT: String(port),
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_URL: '',
      WORKER_AUTO_RUN: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${apiUrl}/health`)).ok) return;
    } catch {
      // Startup is asynchronous.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Test server did not start');
});

after(async () => {
  if (server.exitCode === null) {
    server.kill();
    await once(server, 'exit');
  }
});

test('illustration settings gate tasks, preserve per-book choices, enforce the cap, and cancel only queued work', async () => {
  const initial = await request('/illustration-settings');
  assert.equal(initial.body.data.settings.enabled, false);
  assert.equal(initial.body.data.settings.monthlyTaskLimit, 100);

  const disabled = await request('/generation-tasks', {
    method: 'POST',
    body: JSON.stringify({ id: 'settings-gated-task', chapterId: 'rain-chapter-1' }),
  });
  assert.equal(disabled.response.status, 409);
  assert.equal(disabled.body.error, 'ILLUSTRATION_SERVICE_DISABLED');

  await request('/illustration-settings', { method: 'PATCH', body: JSON.stringify({ enabled: true }) });
  const unchangedBook = await request('/generation-tasks', {
    method: 'POST',
    body: JSON.stringify({ id: 'book-gated-task', chapterId: 'station-chapter-1' }),
  });
  assert.equal(unchangedBook.response.status, 409);
  assert.equal(unchangedBook.body.error, 'BOOK_ILLUSTRATIONS_DISABLED');

  const enabledBook = await request('/books/station/illustration-settings', {
    method: 'PATCH',
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enabledBook.body.data.illustrationsEnabled, true);

  const created = await request('/generation-tasks', {
    method: 'POST',
    body: JSON.stringify({ id: 'settings-created-task', chapterId: 'station-chapter-1' }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.status, 'queued');

  const disabledAgain = await request('/illustration-settings', {
    method: 'PATCH',
    body: JSON.stringify({ enabled: false }),
  });
  assert.ok(disabledAgain.body.data.cancelledQueuedTasks >= 1);
  const tasksAfterDisable = await request('/generation-tasks');
  const cancelledTask = tasksAfterDisable.body.data.find((task: { id: string }) => task.id === 'settings-created-task');
  assert.equal(cancelledTask.status, 'cancelled');
  const cancelledWorker = await request('/worker/tasks/settings-created-task', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'recognizing', progress: 20 }),
  });
  assert.equal(cancelledWorker.response.status, 409);
  assert.equal(cancelledWorker.body.error, 'TASK_CANCELLED');
  const runningTask = tasksAfterDisable.body.data.find((task: { id: string }) => task.id === 'rain-task-1');
  assert.equal(runningTask.status, 'generating');

  await request('/illustration-settings', {
    method: 'PATCH',
    body: JSON.stringify({ enabled: true, monthlyTaskLimit: 1 }),
  });
  const capped = await request('/generation-tasks', {
    method: 'POST',
    body: JSON.stringify({ id: 'over-cap-task', chapterId: 'station-chapter-1' }),
  });
  assert.equal(capped.response.status, 429);
  assert.equal(capped.body.error, 'MONTHLY_TASK_LIMIT_REACHED');
});
