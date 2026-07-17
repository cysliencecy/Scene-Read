import cors from 'cors';
import express from 'express';
import { books, chapters, generationTasks, sceneImages } from './mockData.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'scene-reader-api' });
});

app.get('/books', (_request, response) => {
  response.json({ data: books });
});

app.get('/books/:bookId', (request, response) => {
  const book = books.find((item) => item.id === request.params.bookId);

  if (!book) {
    response.status(404).json({ error: 'BOOK_NOT_FOUND' });
    return;
  }

  response.json({ data: book });
});

app.get('/books/:bookId/chapters', (request, response) => {
  response.json({
    data: chapters.filter((chapter) => chapter.bookId === request.params.bookId),
  });
});

app.get('/chapters/:chapterId', (request, response) => {
  const chapter = chapters.find((item) => item.id === request.params.chapterId);

  if (!chapter) {
    response.status(404).json({ error: 'CHAPTER_NOT_FOUND' });
    return;
  }

  response.json({ data: chapter });
});

app.get('/generation-tasks', (_request, response) => {
  response.json({ data: generationTasks });
});

app.get('/scene-images', (_request, response) => {
  response.json({ data: sceneImages });
});

app.get('/generation-tasks/:taskId', (request, response) => {
  const task = generationTasks.find((item) => item.id === request.params.taskId);

  if (!task) {
    response.status(404).json({ error: 'TASK_NOT_FOUND' });
    return;
  }

  response.json({ data: task });
});

app.get('/scene-images/:imageId', (request, response) => {
  const image = sceneImages.find((item) => item.id === request.params.imageId);

  if (!image) {
    response.status(404).json({ error: 'SCENE_IMAGE_NOT_FOUND' });
    return;
  }

  response.json({ data: image });
});

app.listen(port, () => {
  console.log(`SceneReader API listening on http://localhost:${port}`);
});
