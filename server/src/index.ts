import cors from 'cors';
import express from 'express';
import { sceneImages } from './mockData.js';
import {
  createBook,
  createChapter,
  createGenerationTask,
  dataMode,
  getBook,
  getChapter,
  getGenerationTask,
  listBooks,
  listChaptersByBook,
  listGenerationTasks,
} from './repository.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const workerSceneCandidateResults: unknown[] = [];

app.use(cors());
app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'scene-reader-api', dataMode });
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

app.get('/scene-images', (_request, response) => {
  response.json({ data: sceneImages });
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

app.get('/scene-images/:imageId', (request, response) => {
  const image = sceneImages.find((item) => item.id === request.params.imageId);

  if (!image) {
    response.status(404).json({ error: 'SCENE_IMAGE_NOT_FOUND' });
    return;
  }

  response.json({ data: image });
});

app.post('/worker/scene-candidates', (request, response) => {
  workerSceneCandidateResults.push(request.body);
  response.status(202).json({ data: { accepted: true, count: workerSceneCandidateResults.length } });
});

app.get('/worker/scene-candidates', (_request, response) => {
  response.json({ data: workerSceneCandidateResults });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof Error && error.message === 'SUPABASE_NOT_CONFIGURED') {
    response.status(503).json({
      error: 'SUPABASE_NOT_CONFIGURED',
      message: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable persistent writes.',
    });
    return;
  }

  console.error(error);
  response.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
});

app.listen(port, () => {
  console.log(`SceneReader API listening on http://localhost:${port} (${dataMode})`);
});
