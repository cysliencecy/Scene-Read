import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OnlineBookError } from './gutendex.js';
import { importOnlineBookBySource, searchOnlineBooks } from './onlineBookService.js';
import {
  createBook,
  createChapter,
  createGenerationTask,
  dataMode,
  deleteBook,
  findImageGenerationAttemptByKey,
  findManualImageGenerationAttemptByTask,
  getBook,
  getChapter,
  getGenerationTask,
  getSceneCandidate,
  getSceneImage,
  importBook,
  listBooks,
  listBookVisualProfiles,
  listChaptersByBook,
  listGenerationTasks,
  listImageGenerationAttempts,
  listSceneImages,
  listSceneCandidates,
  updateGenerationTask,
  upsertImageGenerationAttempt,
  upsertSceneCandidate,
} from './repository.js';
import {
  API_ERROR_CODES,
  ApiInputError,
  parseAttemptCallback,
  parseManualRegeneration,
  parseWorkerCandidateCallback,
} from './imagePipeline.js';
import type { SceneCandidate, VisualProfileFact } from './types.js';
import { buildFormalWorkerArguments, shouldAutoRunWorker } from './workerDispatch.js';

export const app = express();
const port = Number(process.env.PORT ?? 4000);
const runningTaskIds = new Set<string>();
const manualReclassificationInstructions = new Map<string, { kind: 'reclassify'; candidateId: string; idempotencyKey: string }>();
const activeTaskStatuses = new Set(['queued', 'recognizing', 'generating']);

function candidateProfileFacts(candidate: SceneCandidate): VisualProfileFact[] {
  if (!candidate.rawResponse || typeof candidate.rawResponse !== 'object') return [];
  const facts = (candidate.rawResponse as { profileFactSuggestions?: unknown }).profileFactSuggestions;
  return Array.isArray(facts) ? facts as VisualProfileFact[] : [];
}

async function toDebugDetail(candidate: SceneCandidate, includeAttempts = true) {
  return {
    ...candidate,
    classification: candidate.classification,
    contractVersion: candidate.contractVersion,
    profileVersion: candidate.profileVersion,
    profileFactSuggestions: candidateProfileFacts(candidate),
    attempts: includeAttempts ? await listImageGenerationAttempts(candidate.id) : [],
  };
}

function manualTaskId(candidateId: string, idempotencyKey: string) {
  const digest = createHash('sha256').update(`${candidateId}:${idempotencyKey}`).digest('hex').slice(0, 20);
  return `task-manual-${digest}`;
}

function reclassificationTaskId(candidateId: string, idempotencyKey: string) {
  const candidateToken = Buffer.from(candidateId, 'utf8').toString('base64url');
  const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 20);
  return `task-reclassify.${candidateToken}.${digest}`;
}

function persistedReclassificationInstruction(taskId: string) {
  const match = /^task-reclassify\.([A-Za-z0-9_-]+)\.[a-f0-9]{20}$/.exec(taskId);
  if (!match?.[1]) return undefined;
  return {
    kind: 'reclassify' as const,
    candidateId: Buffer.from(match[1], 'base64url').toString('utf8'),
    idempotencyKey: taskId,
  };
}

async function listImageBackfilledSceneCandidates(filters: { chapterId?: string; taskId?: string }) {
  const images = (await listSceneImages()).filter((image) => !filters.chapterId || image.chapterId === filters.chapterId);
  return images.map((image, index) => ({
    id: image.id.replace(/-image$/, '') + '-candidate-backfill',
    taskId: filters.taskId ?? 'task-' + image.chapterId + '-scene-image',
    chapterId: image.chapterId,
    order: index,
    sourceBlockId: image.sourceBlockId ?? '',
    position: image.position ?? index,
    reason: 'Backfilled from generated scene image because scene_candidates is empty.',
    sourceText: image.prompt,
    promptDraft: image.prompt,
    finalPrompt: image.prompt,
    imageType: image.imageType ?? 'scene',
    locationChange: 'Backfilled from generated image',
    confidence: 0,
    provider: 'backfill',
    promptVersion: 'scene-v1',
    rawResponse: image,
  }));
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const workerSourcePath = path.resolve(projectRoot, 'worker', 'src');

function getWorkerCommand() {
  if (process.env.WORKER_PYTHON) {
    return { command: process.env.WORKER_PYTHON, args: [] };
  }

  if (process.platform === 'win32') {
    const bundledPython = path.join(
      process.env.USERPROFILE ?? '',
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'python',
      'python.exe',
    );
    if (existsSync(bundledPython)) {
      return { command: bundledPython, args: [] };
    }

    return { command: 'py', args: ['-3'] };
  }

  return { command: 'python3', args: [] };
}

function runWorkerForTask(taskId: string) {
  if (!shouldAutoRunWorker(process.env)) return;
  if (runningTaskIds.has(taskId)) return;
  runningTaskIds.add(taskId);

  const { command, args } = getWorkerCommand();
  const child = spawn(
    command,
    [
      ...args,
      ...buildFormalWorkerArguments({
        taskId,
        apiUrl: `http://localhost:${port}`,
        maxImages: process.env.WORKER_MAX_IMAGES ?? '3',
        environment: process.env,
      }),
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONPATH: process.env.PYTHONPATH ? `${workerSourcePath}${path.delimiter}${process.env.PYTHONPATH}` : workerSourcePath,
      },
      windowsHide: true,
      stdio: 'pipe',
    },
  );

  child.stdout.on('data', (data) => {
    console.log(`[worker:${taskId}] ${String(data).trim()}`);
  });
  child.stderr.on('data', (data) => {
    console.error(`[worker:${taskId}] ${String(data).trim()}`);
  });
  child.on('error', (error) => {
    runningTaskIds.delete(taskId);
    console.error(`[worker:${taskId}] failed to start`, error);
  });
  child.on('exit', (code) => {
    runningTaskIds.delete(taskId);
    if (code !== 0) {
      console.error(`[worker:${taskId}] exited with code ${code}`);
    }
  });
}

app.use(cors());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? '25mb' }));

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'scene-reader-api', dataMode });
});

app.get('/online-books/search', async (request, response, next) => {
  try {
    const query = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const page = Number(request.query.page ?? 1);
    if (!query || query.length > 100) {
      response.status(400).json({ error: 'INVALID_SEARCH_QUERY', message: '请输入 1-100 个字符的书名或作者。' });
      return;
    }
    if (!Number.isInteger(page) || page < 1 || page > 1000) {
      response.status(400).json({ error: 'INVALID_PAGE' });
      return;
    }
    response.json({ data: await searchOnlineBooks(query, page) });
  } catch (error) {
    next(error);
  }
});

app.post('/online-books/import', async (request, response, next) => {
  try {
    const source = request.body?.source;
    const sourceBookId = request.body?.sourceBookId;
    const visualStyle = request.body?.visualStyle;
    if ((source !== 'gutenberg' && source !== 'wikisource') || typeof sourceBookId !== 'string') {
      response.status(400).json({ error: 'INVALID_ONLINE_BOOK' });
      return;
    }
    if (visualStyle !== '写实' && visualStyle !== '动漫' && visualStyle !== '插画') {
      response.status(400).json({ error: 'INVALID_VISUAL_STYLE' });
      return;
    }
    response.status(201).json({ data: await importOnlineBookBySource(source, sourceBookId, visualStyle) });
  } catch (error) {
    next(error);
  }
});

app.get('/books', async (_request, response, next) => {
  try {
    response.json({ data: await listBooks() });
  } catch (error) {
    next(error);
  }
});

app.post('/books', async (request, response, next) => {
  try {
    response.status(201).json({ data: await createBook(request.body) });
  } catch (error) {
    next(error);
  }
});

app.post('/books/import', async (request, response, next) => {
  try {
    const book = request.body?.book;
    const chapters = request.body?.chapters;
    if (!book || !Array.isArray(chapters)) {
      response.status(400).json({ error: 'INVALID_BOOK_IMPORT' });
      return;
    }

    response.status(201).json({ data: await importBook({ book, chapters }) });
  } catch (error) {
    next(error);
  }
});

app.get('/books/:bookId', async (request, response, next) => {
  try {
    const book = await getBook(request.params.bookId);

    if (!book) {
      response.status(404).json({ error: 'BOOK_NOT_FOUND' });
      return;
    }

    response.json({ data: book });
  } catch (error) {
    next(error);
  }
});

app.delete('/books/:bookId', async (request, response, next) => {
  try {
    const deleted = await deleteBook(request.params.bookId);

    if (!deleted) {
      response.status(404).json({ error: 'BOOK_NOT_FOUND' });
      return;
    }

    response.json({ data: { deleted: true, bookId: request.params.bookId } });
  } catch (error) {
    next(error);
  }
});

app.get('/books/:bookId/chapters', async (request, response, next) => {
  try {
    response.json({ data: await listChaptersByBook(request.params.bookId) });
  } catch (error) {
    next(error);
  }
});

app.post('/chapters', async (request, response, next) => {
  try {
    response.status(201).json({ data: await createChapter(request.body) });
  } catch (error) {
    next(error);
  }
});

app.post('/chapters/:chapterId/generation-task', async (request, response, next) => {
  try {
    const existingTaskId = `task-${request.params.chapterId}-scene-image`;
    const existingTask = await getGenerationTask(existingTaskId);

    if (existingTask && activeTaskStatuses.has(existingTask.status)) {
      response.json({ data: existingTask });
      return;
    }

    const existingImages = (await listSceneImages()).filter((image) => image.chapterId === request.params.chapterId);
    if (existingTask?.status === 'completed' && existingImages.length > 0) {
      response.json({ data: existingTask });
      return;
    }

    if (existingTask?.status === 'failed') {
      response.json({ data: existingTask });
      return;
    }

    const task = await createGenerationTask({
      ...request.body,
      chapterId: request.params.chapterId,
      label: request.body?.label ?? '场景图生成已排队',
      status: request.body?.status ?? 'queued',
      progress: request.body?.progress ?? 0,
      taskType: 'scene_image',
      errorMessage: undefined,
    });
    response.status(201).json({ data: task });
    runWorkerForTask(task.id);
  } catch (error) {
    next(error);
  }
});

app.get('/chapters/:chapterId', async (request, response, next) => {
  try {
    const chapter = await getChapter(request.params.chapterId);

    if (!chapter) {
      response.status(404).json({ error: 'CHAPTER_NOT_FOUND' });
      return;
    }

    response.json({ data: chapter });
  } catch (error) {
    next(error);
  }
});

app.get('/generation-tasks', async (_request, response, next) => {
  try {
    response.json({ data: await listGenerationTasks() });
  } catch (error) {
    next(error);
  }
});


app.get('/scene-candidates', async (request, response, next) => {
  try {
    const chapterId = typeof request.query.chapterId === 'string' ? request.query.chapterId : undefined;
    const taskId = typeof request.query.taskId === 'string' ? request.query.taskId : undefined;
    const persistedCandidates = await listSceneCandidates({ chapterId, taskId });
    const imageBackfilledCandidates = persistedCandidates.length > 0
      ? []
      : await listImageBackfilledSceneCandidates({ chapterId, taskId });
    const candidates = persistedCandidates.length > 0 ? persistedCandidates : imageBackfilledCandidates;
    const includeAttempts = request.query.includeAttempts === 'true';
    response.json({ data: await Promise.all(candidates.map((candidate) => toDebugDetail(candidate, includeAttempts))) });
  } catch (error) {
    next(error);
  }
});

app.get('/scene-images', async (_request, response, next) => {
  try {
    response.json({ data: await listSceneImages() });
  } catch (error) {
    next(error);
  }
});

app.post('/generation-tasks', async (request, response, next) => {
  try {
    response.status(201).json({ data: await createGenerationTask(request.body) });
  } catch (error) {
    next(error);
  }
});

app.get('/generation-tasks/:taskId', async (request, response, next) => {
  try {
    const task = await getGenerationTask(request.params.taskId);

    if (!task) {
      response.status(404).json({ error: 'TASK_NOT_FOUND' });
      return;
    }

    response.json({ data: task });
  } catch (error) {
    next(error);
  }
});

app.post('/generation-tasks/:taskId/retry', async (request, response, next) => {
  try {
    const task = await getGenerationTask(request.params.taskId);

    if (!task) {
      response.status(404).json({ error: 'TASK_NOT_FOUND' });
      return;
    }

    if (task.status !== 'failed') {
      response.json({ data: task });
      return;
    }

    const retriedTask = await updateGenerationTask(task.id, {
      status: 'queued',
      progress: 0,
      label: '场景图生成已重新排队',
      errorMessage: undefined,
      provider: undefined,
      durationMs: undefined,
    });
    response.json({ data: retriedTask });
    runWorkerForTask(retriedTask.id);
  } catch (error) {
    next(error);
  }
});

app.get('/worker/tasks/:taskId/chapter-payload', async (request, response, next) => {
  try {
    const task = await getGenerationTask(request.params.taskId);

    if (!task) {
      response.status(404).json({ error: 'TASK_NOT_FOUND' });
      return;
    }

    const chapter = await getChapter(task.chapterId);

    if (!chapter) {
      response.status(404).json({ error: 'CHAPTER_NOT_FOUND' });
      return;
    }

    const bookId = task.bookId ?? chapter.bookId;
    const profiles = await listBookVisualProfiles(bookId);
    const manualAttempt = await findManualImageGenerationAttemptByTask(task.id);
    const manualCandidate = manualAttempt ? await getSceneCandidate(manualAttempt.candidateId) : null;
    const reclassification = manualReclassificationInstructions.get(task.id) ?? persistedReclassificationInstruction(task.id);

    response.json({
      data: {
        taskId: task.id,
        bookId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        blocks: chapter.blocks.filter((block) => block.type === 'paragraph'),
        profiles,
        ...(manualAttempt?.trigger === 'manual' && manualCandidate ? {
          manualGeneration: {
            kind: 'generate',
            idempotencyKey: manualAttempt.idempotencyKey,
            candidateId: manualCandidate.id,
            attemptId: manualAttempt.id,
            parentAttemptId: manualAttempt.parentAttemptId,
            requestedType: manualAttempt.requestedType,
            evidence: manualCandidate.classification?.evidence ?? [{
              sourceBlockId: manualCandidate.sourceBlockId,
              sourceText: manualCandidate.sourceText,
            }],
            auxiliaryTags: manualCandidate.classification?.auxiliaryTags ?? [],
            contractVersion: manualCandidate.contractVersion ?? 'composition-v1',
          },
        } : reclassification ? { manualGeneration: reclassification } : {}),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/worker/tasks/:taskId', async (request, response, next) => {
  try {
    response.json({ data: await updateGenerationTask(request.params.taskId, request.body) });
  } catch (error) {
    next(error);
  }
});

app.get('/scene-images/:imageId', async (request, response, next) => {
  try {
    const image = await getSceneImage(request.params.imageId);

    if (!image) {
      response.status(404).json({ error: 'SCENE_IMAGE_NOT_FOUND' });
      return;
    }

    response.json({ data: image });
  } catch (error) {
    next(error);
  }
});

app.post('/worker/scene-candidates', async (request, response, next) => {
  try {
    const callback = parseWorkerCandidateCallback(request.body);
    const candidates = await Promise.all(callback.candidates.map((candidate, index) => upsertSceneCandidate({
      id: candidate.id,
      taskId: callback.taskId,
      bookId: callback.bookId,
      chapterId: callback.chapterId,
      order: index,
      sourceBlockId: candidate.sourceBlockId,
      position: candidate.position,
      sourceText: candidate.classification.evidence[0]?.sourceText ?? '',
      promptDraft: candidate.classification.reason,
      classification: candidate.classification,
      contractVersion: candidate.contractVersion,
      profileVersion: candidate.profileVersion,
      profileFactSuggestions: callback.profileFactSuggestions,
    })));
    response.json({ data: await Promise.all(candidates.map((candidate) => toDebugDetail(candidate))) });
  } catch (error) {
    next(error);
  }
});

app.post('/worker/image-generation-attempts', async (request, response, next) => {
  try {
    const callback = parseAttemptCallback(request.body);
    const candidate = await getSceneCandidate(callback.candidateId);
    if (!candidate) throw new ApiInputError(API_ERROR_CODES.candidateNotFound, 404);
    const existing = await findImageGenerationAttemptByKey(callback.idempotencyKey);
    if (existing && (
      existing.candidateId !== callback.candidateId
      || existing.taskId !== callback.taskId
      || existing.trigger !== callback.trigger
      || existing.requestedType !== callback.requestedType
    )) {
      throw new ApiInputError(API_ERROR_CODES.idempotencyConflict, 409);
    }
    const imageUrl = callback.imageBase64
      ? `data:${callback.mimeType ?? 'application/octet-stream'};base64,${callback.imageBase64}`
      : undefined;
    const attempt = await upsertImageGenerationAttempt({
      idempotencyKey: callback.idempotencyKey,
      candidateId: callback.candidateId,
      taskId: callback.taskId,
      trigger: callback.trigger,
      requestedType: callback.requestedType,
      parentAttemptId: callback.parentAttemptId,
      status: callback.status,
      prompt: callback.prompt,
      provider: callback.provider,
      model: callback.model,
      width: callback.width,
      height: callback.height,
      imageUrl,
      audit: callback.audit,
      classificationSnapshot: candidate.classification,
      contractVersion: candidate.contractVersion,
      profileVersion: candidate.profileVersion,
      artifactMetadata: callback.imageBase64 ? { mimeType: callback.mimeType, retainedForDebug: callback.status !== 'publishable' } : undefined,
    });
    response.json({ data: attempt });
  } catch (error) {
    next(error);
  }
});

app.post('/scene-candidates/:candidateId/regenerations', async (request, response, next) => {
  try {
    const candidate = await getSceneCandidate(request.params.candidateId);
    if (!candidate) throw new ApiInputError(API_ERROR_CODES.candidateNotFound, 404);
    const body = request.body as Record<string, unknown>;

    if (candidate.imageType === 'character' && body.overrideImageType === undefined) {
      if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim() === '') {
        throw new ApiInputError(API_ERROR_CODES.idempotencyKeyRequired);
      }
      const taskId = reclassificationTaskId(candidate.id, body.idempotencyKey);
      const existingTask = await getGenerationTask(taskId);
      const instruction = { kind: 'reclassify' as const, candidateId: candidate.id, idempotencyKey: body.idempotencyKey };
      if (existingTask) {
        manualReclassificationInstructions.set(existingTask.id, instruction);
        response.status(202).json({ data: { task: existingTask, instruction } });
        return;
      }
      const task = await createGenerationTask({
        id: taskId,
        bookId: candidate.bookId,
        chapterId: candidate.chapterId,
        status: 'queued',
        progress: 0,
        taskType: 'scene_image',
        label: 'Legacy character candidate queued for canonical reclassification',
      });
      manualReclassificationInstructions.set(task.id, instruction);
      response.status(202).json({ data: { task, instruction } });
      runWorkerForTask(task.id);
      return;
    }

    const command = parseManualRegeneration(body);
    const existing = await findImageGenerationAttemptByKey(command.idempotencyKey);
    if (existing) {
      if (existing.candidateId !== candidate.id || existing.requestedType !== command.overrideImageType || existing.trigger !== 'manual') {
        throw new ApiInputError(API_ERROR_CODES.idempotencyConflict, 409);
      }
      const task = await getGenerationTask(existing.taskId);
      if (!task) throw new ApiInputError(API_ERROR_CODES.idempotencyConflict, 409);
      response.json({ data: { task, attempt: existing } });
      return;
    }

    const priorAttempts = await listImageGenerationAttempts(candidate.id);
    const parentAttempt = priorAttempts.at(-1);
    const task = await createGenerationTask({
      id: manualTaskId(candidate.id, command.idempotencyKey),
      bookId: candidate.bookId,
      chapterId: candidate.chapterId,
      status: 'queued',
      progress: 0,
      taskType: 'scene_image',
      label: 'Manual image regeneration queued',
    });
    const attempt = await upsertImageGenerationAttempt({
      idempotencyKey: command.idempotencyKey,
      candidateId: candidate.id,
      taskId: task.id,
      parentAttemptId: parentAttempt?.id,
      trigger: 'manual',
      requestedType: command.overrideImageType,
      overriddenFrom: candidate.imageType,
      status: 'queued',
      prompt: candidate.finalPrompt ?? candidate.promptDraft,
      classificationSnapshot: candidate.classification,
      contractVersion: candidate.contractVersion,
      profileVersion: candidate.profileVersion,
    });
    response.status(201).json({ data: { task, attempt } });
    runWorkerForTask(task.id);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof OnlineBookError) {
    response.status(error.status).json({ error: error.code, message: error.message });
    return;
  }

  if (error instanceof ApiInputError) {
    response.status(error.status).json({ error: error.code });
    return;
  }
  if (error instanceof Error && error.message === 'SUPABASE_NOT_CONFIGURED') {
    response.status(503).json({
      error: 'SUPABASE_NOT_CONFIGURED',
      message: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable persistent writes.',
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: error instanceof Error ? error.message : JSON.stringify(error),
  });
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(port, () => {
    console.log(`SceneReader API listening on http://localhost:${port} (${dataMode})`);
  });
}
